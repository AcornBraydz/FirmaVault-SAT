import sys
import os

# Configurar UTF-8 para stdout y stderr en Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

import json
import time
import argparse
import traceback
import zipfile
import tempfile
import shutil
import pandas as pd
import subprocess
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains

SAT_URL = "https://portalcfdi.facturaelectronica.sat.gob.mx/"

def emit(data):
    """Emite evento estructurado en formato JSON a stdout"""
    try:
        print(json.dumps(data, ensure_ascii=False), flush=True)
    except Exception:
        print(json.dumps(data, ensure_ascii=True), flush=True)

def find_browser_executable():
    """Detecta la ruta del navegador disponible en el sistema (Brave, Chrome o Edge)"""
    candidate_paths = [
        r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    ]
    for p in candidate_paths:
        if os.path.exists(p):
            return p
    return None

def crear_excel(folder, data_report, rfc, year):
    """Genera el reporte Excel con formato y colores por emisor"""
    if not data_report:
        return None
    
    df = pd.DataFrame(data_report)
    if 'elemento_fila' in df.columns:
        df = df.drop(columns=['elemento_fila'])

    df = df.sort_values(by=['Fecha de Emisión', 'Nombre o Razón Social del Emisor']).reset_index(drop=True)
    ruta = os.path.join(folder, f"Reporte_{rfc}_{year}.xlsx")

    with pd.ExcelWriter(ruta, engine='xlsxwriter') as writer:
        workbook = writer.book
        worksheet = workbook.add_worksheet('Datos')

        formato_header = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'align': 'center', 'valign': 'vcenter', 'border': 1})
        formato_mes = workbook.add_format({'bold': True, 'bg_color': '#1e293b', 'font_color': 'white', 'align': 'center', 'valign': 'vcenter', 'border': 1, 'size': 13})

        colores_pasteles = ['#E2E8F0', '#E0E7FF', '#FCE7F3', '#FEF3C7', '#DCFCE7', '#E0F2FE', '#F3E8FF', '#FFEDD5']
        emisores_unicos = df['Nombre o Razón Social del Emisor'].unique()
        mapa_colores = {emisor: colores_pasteles[i % len(colores_pasteles)] for i, emisor in enumerate(emisores_unicos)}

        for col_num, value in enumerate(df.columns.values):
            worksheet.write(0, col_num, value, formato_header)

        for i, col in enumerate(df.columns):
            w = max(df[col].astype(str).map(len).max(), len(col)) + 4
            worksheet.set_column(i, i, min(w, 50))

        meses_nombres = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
        current_row_excel = 1
        mes_actual = None

        for row_num in range(len(df)):
            emisor = df.iloc[row_num].get('Nombre o Razón Social del Emisor', '')
            fecha = str(df.iloc[row_num].get('Fecha de Emisión', ''))
            mes_row = fecha[5:7] if pd.notna(fecha) and len(fecha) >= 7 else ""

            if mes_row != mes_actual and mes_row.isdigit():
                mes_actual = mes_row
                nombre_mes = meses_nombres[int(mes_row)]
                if len(df.columns) > 1:
                    worksheet.merge_range(current_row_excel, 0, current_row_excel, len(df.columns) - 1, nombre_mes, formato_mes)
                else:
                    worksheet.write(current_row_excel, 0, nombre_mes, formato_mes)
                current_row_excel += 1

            color = mapa_colores.get(emisor, '#FFFFFF')
            formato_fila = workbook.add_format({'bg_color': color, 'align': 'center', 'valign': 'vcenter', 'border': 1})

            for col_num in range(len(df.columns)):
                valor = df.iloc[row_num, col_num]
                if pd.isna(valor): valor = ""
                worksheet.write(current_row_excel, col_num, str(valor), formato_fila)
            current_row_excel += 1

    return ruta

def crear_paquete_zip(folder_to_zip, zip_output_path, allowed_extensions=None):
    """Comprime la carpeta de nóminas en un archivo zip respetando las extensiones permitidas"""
    nombre_zip = os.path.basename(zip_output_path)
    with zipfile.ZipFile(zip_output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(folder_to_zip):
            for file in files:
                if file.lower().endswith('.zip') or file == nombre_zip:
                    continue
                if allowed_extensions:
                    ext = os.path.splitext(file)[1].lower()
                    if ext not in allowed_extensions:
                        continue
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, folder_to_zip)
                zipf.write(full_path, rel_path)
    return zip_output_path

def run_extraction(year, cer_path, key_path, password, manual_rfc, output_dir, format_type="both", doc_type="todas", role="emisor"):
    browser_exe = find_browser_executable()
    if not browser_exe:
        emit({"type": "error", "error": "No se encontró ningún navegador compatible (Brave, Chrome o Edge)."})
        return False

    emit({"type": "log", "msg": f"🚀 Usando navegador: {os.path.basename(browser_exe)}"})
    emit({"type": "log", "msg": f"📅 Ejercicio fiscal seleccionado: {year}"})
    emit({"type": "log", "msg": f"👤 RFC del cliente: {manual_rfc}"})
    role_label = "Patrón (Nómina Emitida a Trabajadores)" if role == "emisor" else "Empleado (Recibos Recibidos)"
    emit({"type": "log", "msg": f"💼 Modalidad fiscal: {role_label}"})
    formato_desc = "PDF + XML (incluye Excel)" if format_type == "both" else ("PDF" if format_type == "pdf" else "XML")
    emit({"type": "log", "msg": f"📦 Formato solicitado: {formato_desc}"})
    tipo_desc = "Todos los comprobantes (Nóminas, Ingresos, etc.)" if doc_type in ["todas", "all", "todos"] else ("Solo Nóminas" if doc_type == "nominas" else f"Tipo: {doc_type}")
    emit({"type": "log", "msg": f"🏷️ Filtro seleccionado: {tipo_desc}"})

    temp_profile_dir = tempfile.mkdtemp(prefix="sat_session_")

    options = Options()
    options.binary_location = browser_exe
    options.page_load_strategy = "eager"
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--ignore-certificate-errors")
    options.add_argument("--allow-running-insecure-content")
    options.add_argument(f"--user-data-dir={temp_profile_dir}")
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

    prefs = {
        "profile.default_content_settings.popups": 0,
        "profile.default_content_setting_values.cookies": 1,
        "profile.cookie_controls_mode": 0,
        "profile.block_third_party_cookies": False,
    }
    options.add_experimental_option("prefs", prefs)

    driver = None
    data_report = []
    total_descargas = 0

    try:
        service = Service()
        if sys.platform == "win32":
            service.creation_flags = subprocess.CREATE_NO_WINDOW

        driver = webdriver.Chrome(service=service, options=options)
        driver.set_page_load_timeout(120)
        driver.set_script_timeout(120)
        wait = WebDriverWait(driver, 35)

        emit({"type": "log", "msg": "🌐 Conectando al portal del SAT..."})
        try:
            from tenacity import Retrying, wait_exponential, stop_after_attempt
            for attempt in Retrying(wait=wait_exponential(multiplier=2, min=4, max=20), stop=stop_after_attempt(5)):
                with attempt:
                    driver.get(SAT_URL)
                    time.sleep(2)
                    if "503 Service Unavailable" in driver.page_source or "The service is unavailable" in driver.page_source:
                        emit({"type": "log", "msg": "⚠️ El SAT devolvió 503. Reintentando..."})
                        raise Exception("SAT 503")
        except Exception as e:
            emit({"type": "error", "error": f"Error crítico de red conectando al SAT tras reintentos: {str(e)}"})
            return False
        time.sleep(3)

        # Login con e.firma
        emit({"type": "log", "msg": "🔑 Autenticando con e.firma (.cer, .key)..."})

        # Comprobar si ya está dentro
        curr_initial_url = driver.current_url.lower()
        ya_autenticado = ("portalcfdi.facturaelectronica.sat.gob.mx" in curr_initial_url and "cfdiau" not in curr_initial_url) or \
                         bool(driver.find_elements(By.ID, "DdlAnio")) or \
                         bool(driver.find_elements(By.ID, "ctl00_LblRfcAutenticado"))

        if not ya_autenticado:
            if not os.path.exists(cer_path) or not os.path.exists(key_path):
                emit({"type": "error", "error": "Archivos .cer o .key no encontrados en el sistema."})
                return False

            wait_login = WebDriverWait(driver, 25)

            # Si no estamos en la vista de e.firma pero está el botón, dar clic
            if not driver.find_elements(By.ID, "fileCertificate"):
                try:
                    btn_fiel = wait_login.until(EC.element_to_be_clickable((By.ID, "buttonFiel")))
                    time.sleep(1)
                    try:
                        btn_fiel.click()
                    except Exception:
                        driver.execute_script("arguments[0].click();", btn_fiel)
                    time.sleep(2)
                except Exception:
                    pass

            wait_login.until(EC.presence_of_element_located((By.ID, "fileCertificate")))
            time.sleep(1.5)

            input_cer = driver.find_element(By.ID, "fileCertificate")
            input_key = driver.find_element(By.ID, "filePrivateKey")
            input_pass = driver.find_element(By.ID, "privateKeyPassword")

            input_cer.send_keys(cer_path)
            driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_cer)
            time.sleep(1)

            input_key.send_keys(key_path)
            driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_key)
            time.sleep(1)

            input_pass.clear()
            input_pass.send_keys(password)
            driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_pass)
            time.sleep(1)

            for _ in range(15):
                c = driver.find_element(By.ID, "txtCertificate").get_attribute("value") or ""
                k = driver.find_element(By.ID, "txtPrivateKey").get_attribute("value") or ""
                r = driver.find_element(By.ID, "rfc").get_attribute("value") or ""
                if c and k and len(r) >= 10:
                    break
                time.sleep(1)

            btn_submit = driver.find_element(By.ID, "submit")
            emit({"type": "log", "msg": "⏳ Enviando credenciales ante el SAT..."})
            
            try:
                btn_submit.click()
            except Exception:
                try:
                    driver.execute_script("arguments[0].click();", btn_submit)
                except Exception:
                    pass

            emit({"type": "log", "msg": "⏳ Validando credenciales ante el SAT (esperando respuesta)..."})
            
            # Polling robusto con timeout extendido para esperar respuesta del SAT
            inicio_login = time.time()
            max_espera = 60
            autenticado = False
            error_login = None

            while time.time() - inicio_login < max_espera:
                time.sleep(1.5)
                try:
                    alertas = driver.find_elements(By.CSS_SELECTOR, ".alert-danger, #msgbox, #lblError")
                    for a in alertas:
                        if a.is_displayed() and a.text.strip():
                            error_login = a.text.strip()
                            break
                    if error_login:
                        break
                except Exception:
                    pass

                try:
                    curr_url = driver.current_url.lower()
                    if ("portalcfdi.facturaelectronica.sat.gob.mx" in curr_url and "cfdiau" not in curr_url) or \
                       "consultareceptor.aspx" in curr_url or \
                       "default.aspx" in curr_url:
                        autenticado = True
                        break
                except Exception:
                    pass

                try:
                    if driver.find_elements(By.ID, "DdlAnio") or driver.find_elements(By.ID, "ctl00_LblRfcAutenticado"):
                        autenticado = True
                        break
                except Exception:
                    pass

            if error_login:
                emit({"type": "error", "error": f"Error del SAT en login: {error_login[:150]}"})
                return False

            if not autenticado:
                try:
                    if "cfdiau.sat.gob.mx" not in driver.current_url.lower():
                        autenticado = True
                except Exception:
                    pass

            if not autenticado:
                emit({"type": "error", "error": "El servidor del SAT no respondió a tiempo durante el inicio de sesión."})
                return False

        emit({"type": "log", "msg": "✅ Autenticación exitosa en el portal."})

        # Directorios de salida
        final_path = os.path.join(output_dir, manual_rfc, str(year))
        final_path_nominas = os.path.join(final_path, f"Descargas de Nominas {year}")
        os.makedirs(final_path_nominas, exist_ok=True)

        try:
            driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                'behavior': 'allowAndName',
                'downloadPath': final_path_nominas,
                'eventsEnabled': True
            })
        except: pass

        driver.execute_cdp_cmd('Page.setDownloadBehavior', {
            'behavior': 'allow',
            'downloadPath': final_path_nominas
        })

        # Navegación a ConsultaEmisor o ConsultaReceptor según role
        is_emisor = (str(role).lower() in ["emisor", "patron", "patrón"])
        target_page = "ConsultaEmisor.aspx" if is_emisor else "ConsultaReceptor.aspx"
        target_url = f"https://portalcfdi.facturaelectronica.sat.gob.mx/{target_page}"
        role_nombre = "Emitidos (Patrón)" if is_emisor else "Recibidos (Empleado)"

        try:
            if target_page not in driver.current_url:
                emit({"type": "log", "msg": f"🧭 Navegando al módulo de Comprobantes {role_nombre}..."})
                try:
                    driver.get(target_url)
                except Exception:
                    pass
                time.sleep(3)
        except Exception:
            pass

        wait.until(EC.presence_of_element_located((By.ID, "ctl00_MainContent_RdoFechas")))
        try:
            label_fecha = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "label[for='ctl00_MainContent_RdoFechas']")))
            driver.execute_script("arguments[0].click();", label_fecha)
            time.sleep(2)
        except: pass

        meses = [str(m) for m in range(1, 13)]
        nombres_meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]

        for i, mes_val in enumerate(meses):
            mes_display = mes_val.zfill(2)
            nombre_mes = nombres_meses[i]
            final_path_mes = os.path.join(final_path_nominas, nombre_mes)
            os.makedirs(final_path_mes, exist_ok=True)

            percent = int((i / 12) * 100)
            emit({"type": "progress", "value": percent})
            emit({"type": "month_status", "month": i, "status": "processing", "desc": "Buscando..."})
            emit({"type": "log", "msg": f"🔍 [{nombre_mes}] Consultando CFDI recibidos..."})

            try:
                try:
                    driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                        'behavior': 'allowAndName',
                        'downloadPath': final_path_mes,
                        'eventsEnabled': True
                    })
                except: pass
                driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                    'behavior': 'allow',
                    'downloadPath': final_path_mes
                })

                wait.until(EC.presence_of_element_located((By.ID, "DdlAnio")))
                Select(driver.find_element(By.ID, "DdlAnio")).select_by_value(str(year))
                time.sleep(1)
                Select(driver.find_element(By.ID, "ctl00_MainContent_CldFecha_DdlMes")).select_by_value(mes_val)
                time.sleep(1)

                btn_buscar = driver.find_element(By.ID, "ctl00_MainContent_BtnBusqueda")
                try:
                    btn_buscar.click()
                except Exception:
                    driver.execute_script("arguments[0].click();", btn_buscar)
                time.sleep(4)

                lbl_mensaje = driver.find_elements(By.ID, "ctl00_MainContent_lblMensajeDisp")
                if lbl_mensaje and lbl_mensaje[0].is_displayed() and lbl_mensaje[0].text.strip() != "":
                    emit({"type": "month_status", "month": i, "status": "info", "desc": "Sin facturas"})
                    emit({"type": "log", "msg": f"ℹ️ [{nombre_mes}] No hay facturas en este periodo."})
                    continue

                WebDriverWait(driver, 6).until(EC.presence_of_element_located((By.ID, "ctl00_MainContent_tblResult")))
                filas = driver.find_elements(By.XPATH, "//table[@id='ctl00_MainContent_tblResult']//tbody//tr")

                nominas_mes = []
                for fila in filas:
                    if "RFC Emisor" in fila.text: continue
                    celdas = fila.find_elements(By.XPATH, "./td")
                    if len(celdas) >= 16:
                        folio = celdas[1].text.strip()
                        # Validar formato mínimo de UUID
                        if not folio or len(folio) < 30 or "-" not in folio:
                            continue

                        efecto_txt = celdas[10].text.strip()
                        efecto_lower = efecto_txt.lower()

                        # Filtrar según doc_type
                        if doc_type == "nominas":
                            if not ("nómina" in efecto_lower or "nomina" in efecto_lower):
                                continue
                        elif doc_type in ["ingreso", "ingresos"]:
                            if "ingreso" not in efecto_lower:
                                continue
                        elif doc_type in ["egreso", "egresos"]:
                            if "egreso" not in efecto_lower:
                                continue
                        # Si es "todas" o "all", procesa todos los comprobantes

                        nominas_mes.append({
                            "Folio Fiscal": folio,
                            "RFC Emisor": celdas[2].text.strip(),
                            "Nombre o Razón Social del Emisor": celdas[3].text.strip(),
                            "RFC Receptor": celdas[4].text.strip(),
                            "Nombre o Razón Social del Receptor": celdas[5].text.strip(),
                            "Fecha de Emisión": celdas[6].text.strip(),
                            "Fecha de Certificación": celdas[7].text.strip(),
                            "PAC que Certificó": celdas[8].text.strip(),
                            "Total": celdas[9].text.strip(),
                            "Efecto del Comprobante": efecto_txt,
                            "Estatus de cancelación": celdas[11].text.strip(),
                            "Estado del Comprobante": celdas[12].text.strip(),
                            "Estatus de Proceso de Cancelación": celdas[13].text.strip(),
                            "Fecha de Solicitud de la Cancelación": celdas[14].text.strip(),
                            "Fecha de Cancelación": celdas[15].text.strip(),
                            "RFC a cuenta de terceros": celdas[16].text.strip() if len(celdas) > 16 else "",
                            "elemento_fila": fila
                        })

                if nominas_mes:
                    main_win = driver.current_window_handle
                    total_mes = len(nominas_mes)
                    descargados = 0
                    emit({"type": "log", "msg": f"📄 [{nombre_mes}] Se encontraron {total_mes} comprobantes fiscales."})

                    for idx_nom, item in enumerate(nominas_mes):
                        folio = item['Folio Fiscal']
                        rfc_emisor = item['RFC Emisor'] or "SIN_RFC"
                        final_path_emisor = os.path.join(final_path_mes, rfc_emisor)
                        os.makedirs(final_path_emisor, exist_ok=True)

                        try:
                            driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                                'behavior': 'allowAndName',
                                'downloadPath': final_path_emisor,
                                'eventsEnabled': True
                            })
                        except: pass
                        driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                            'behavior': 'allow',
                            'downloadPath': final_path_emisor
                        })

                        # Función auxiliar para localizar y mover archivos descargados por CDP
                        def check_and_organize_file(ext):
                            search_dirs = [final_path_emisor, final_path_mes, final_path_nominas]
                            for s_dir in search_dirs:
                                if os.path.exists(s_dir):
                                    for f in os.listdir(s_dir):
                                        if folio.lower() in f.lower() and f.lower().endswith(ext):
                                            if not (f.lower().endswith('.crdownload') or f.lower().endswith('.tmp')):
                                                src = os.path.join(s_dir, f)
                                                dst = os.path.join(final_path_emisor, f)
                                                if os.path.abspath(src) != os.path.abspath(dst):
                                                    try:
                                                        import shutil
                                                        shutil.move(src, dst)
                                                    except Exception: pass
                                                return True
                            return False

                        requiere_pdf = format_type in ['both', 'pdf']
                        requiere_xml = format_type in ['both', 'xml']

                        tiene_pdf = check_and_organize_file('.pdf') if requiere_pdf else False
                        tiene_xml = check_and_organize_file('.xml') if requiere_xml else False

                        if (not requiere_pdf or tiene_pdf) and (not requiere_xml or tiene_xml):
                            descargados += 1
                            total_descargas += 1
                            tag_ya = "PDF + XML" if format_type == "both" else ("PDF" if format_type == "pdf" else "XML")
                            emit({"type": "log", "msg": f"⏭️ Ya existía ({tag_ya}): {folio[:8]}..."})
                            continue

                        # --- 1. DESCARGA DE XML (BtnDescarga) ---
                        if requiere_xml and not tiene_xml:
                            xml_confirmed = False
                            for intento in range(3):
                                try:
                                    btn_xml = None
                                    try:
                                        btn_xml = item['elemento_fila'].find_element(By.XPATH, ".//span[@id='BtnDescarga'] | .//*[@id='BtnDescarga'] | .//span[contains(@id, 'BtnDescarga')]")
                                    except Exception:
                                        row_rel = driver.find_element(By.XPATH, f"//tr[.//td[contains(text(), '{folio}')]]")
                                        btn_xml = row_rel.find_element(By.XPATH, ".//span[@id='BtnDescarga'] | .//*[@id='BtnDescarga'] | .//span[contains(@id, 'BtnDescarga')]")

                                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn_xml)
                                    time.sleep(0.5)
                                    try:
                                        ActionChains(driver).move_to_element(btn_xml).click().perform()
                                    except Exception:
                                        driver.execute_script("arguments[0].click();", btn_xml)
                                except Exception as e:
                                    emit({"type": "log", "msg": f"⚠️ Intento fallido BtnDescarga XML para {folio[:8]}..."})
                                    break

                                for _ in range(25):
                                    time.sleep(0.5)
                                    if check_and_organize_file('.xml'):
                                        xml_confirmed = True
                                        break

                                if xml_confirmed:
                                    break
                                time.sleep(1)

                        # --- 2. DESCARGA DE PDF (BtnRI) ---
                        if requiere_pdf and not tiene_pdf:
                            pdf_confirmed = False
                            for intento in range(3):
                                try:
                                    btn_pdf = None
                                    try:
                                        btn_pdf = item['elemento_fila'].find_element(By.XPATH, ".//span[@id='BtnRI'] | .//*[@id='BtnRI'] | .//span[contains(@id, 'BtnRI')]")
                                    except Exception:
                                        row_rel = driver.find_element(By.XPATH, f"//tr[.//td[contains(text(), '{folio}')]]")
                                        btn_pdf = row_rel.find_element(By.XPATH, ".//span[@id='BtnRI'] | .//*[@id='BtnRI'] | .//span[contains(@id, 'BtnRI')]")

                                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn_pdf)
                                    time.sleep(0.5)
                                    try:
                                        ActionChains(driver).move_to_element(btn_pdf).click().perform()
                                    except Exception:
                                        driver.execute_script("arguments[0].click();", btn_pdf)
                                except Exception as e:
                                    emit({"type": "log", "msg": f"⚠️ Intento fallido BtnRI PDF para {folio[:8]}..."})
                                    break

                                for _ in range(30):
                                    time.sleep(0.5)
                                    if check_and_organize_file('.pdf'):
                                        pdf_confirmed = True
                                        break

                                # Cerrar ventanas adicionales si se abrieron
                                try:
                                    driver.set_page_load_timeout(3)
                                    for h in driver.window_handles:
                                        if h != main_win:
                                            try:
                                                driver.switch_to.window(h)
                                                driver.close()
                                            except: pass
                                finally:
                                    try:
                                        driver.set_page_load_timeout(60)
                                        driver.switch_to.window(main_win)
                                    except: pass

                                if pdf_confirmed:
                                    break
                                time.sleep(1.5)

                        ok_pdf = check_and_organize_file('.pdf') if requiere_pdf else False
                        ok_xml = check_and_organize_file('.xml') if requiere_xml else False

                        cumplio_req = (not requiere_pdf or ok_pdf) and (not requiere_xml or ok_xml)

                        if cumplio_req:
                            descargados += 1
                            total_descargas += 1
                            tag_archivos = "PDF + XML" if format_type == "both" else ("PDF" if format_type == "pdf" else "XML")
                            emit({"type": "log", "msg": f"📥 [{descargados}/{total_mes}] Descargado ({tag_archivos}): {folio[:8]}..."})
                        elif (requiere_pdf and ok_pdf) or (requiere_xml and ok_xml):
                            descargados += 1
                            total_descargas += 1
                            tag_parcial = "PDF" if ok_pdf else "XML"
                            emit({"type": "log", "msg": f"⚠️ [{descargados}/{total_mes}] Descarga parcial ({tag_parcial}): {folio[:8]}..."})
                        else:
                            emit({"type": "log", "msg": f"❌ No se descargó tras 3 intentos: {folio[:8]}..."})

                    emit({"type": "month_status", "month": i, "status": "success", "desc": f"{descargados}/{total_mes} comp."})
                    data_report.extend(nominas_mes)
                else:
                    emit({"type": "month_status", "month": i, "status": "info", "desc": "Sin registros"})
                    emit({"type": "log", "msg": f"ℹ️ [{nombre_mes}] Sin comprobantes para el criterio seleccionado."})

            except Exception as mes_err:
                emit({"type": "month_status", "month": i, "status": "error", "desc": "Fallo lectura"})
                emit({"type": "log", "msg": f"⚠️ Error procesando {nombre_mes}: {str(mes_err)[:80]}"})
                continue

        excel_path = None
        if data_report and format_type == "both":
            emit({"type": "log", "msg": "📊 Generando reporte Excel con formato y resumen..."})
            excel_path = crear_excel(final_path, data_report, manual_rfc, year)
            emit({"type": "log", "msg": f"✅ Reporte Excel generado: {os.path.basename(excel_path)}"})
        else:
            # Si no es 'both', asegurar que no queden reportes excel residuales en el ZIP
            try:
                for f in os.listdir(final_path):
                    if f.lower().endswith('.xlsx') and f.startswith("Reporte_"):
                        try:
                            os.remove(os.path.join(final_path, f))
                        except Exception:
                            pass
            except Exception:
                pass

        format_suffix = "_PDF" if format_type == "pdf" else ("_XML" if format_type == "xml" else "")
        zip_filename = f"Nominas_{manual_rfc}_{year}{format_suffix}.zip"
        zip_path = os.path.join(final_path, zip_filename)

        allowed_exts = [".pdf"] if format_type == "pdf" else ([".xml"] if format_type == "xml" else [".pdf", ".xml", ".xlsx"])
        emit({"type": "log", "msg": f"📦 Comprimiendo paquete ZIP ({zip_filename})..."})
        crear_paquete_zip(final_path, zip_path, allowed_extensions=allowed_exts)

        emit({"type": "progress", "value": 100})
        # Cerrar sesión formalmente en el portal del SAT para liberar el token
        try:
            emit({"type": "log", "msg": "🔒 Cerrando sesión en el portal del SAT..."})
            driver.get("https://portalcfdi.facturaelectronica.sat.gob.mx/logout.aspx")
            time.sleep(1)
        except Exception:
            pass

        emit({
            "type": "finished",
            "msg": "Extracción completada con éxito.",
            "total_nominas": len(data_report),
            "total_descargas": total_descargas,
            "folder_path": final_path,
            "zip_path": zip_path,
            "excel_path": excel_path
        })
        return True

    except Exception as e:
        emit({"type": "error", "error": f"Error en extracción: {str(e)}\n{traceback.format_exc()}"})
        return False
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        if temp_profile_dir and os.path.exists(temp_profile_dir):
            try:
                shutil.rmtree(temp_profile_dir, ignore_errors=True)
            except Exception:
                pass

def main():
    parser = argparse.ArgumentParser(description="Extractor de Nóminas SAT CLI")
    parser.add_argument("--config", help="Ruta al archivo JSON de configuración")
    parser.add_argument("--year", help="Ejercicio Fiscal a consultar")
    parser.add_argument("--cer", help="Ruta al archivo .cer")
    parser.add_argument("--key", help="Ruta al archivo .key")
    parser.add_argument("--password", help="Contraseña de la e.firma")
    parser.add_argument("--rfc", help="RFC del cliente")
    parser.add_argument("--output", help="Directorio base para guardar las descargas")
    parser.add_argument("--format", default="both", choices=["both", "pdf", "xml"], help="Formato de descarga: both, pdf o xml")
    parser.add_argument("--type", default="todas", help="Tipo de comprobante: todas, nominas, ingreso")
    parser.add_argument("--role", default="emisor", choices=["emisor", "receptor"], help="Rol fiscal: emisor (Patrón) o receptor (Empleado)")

    args = parser.parse_args()

    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        year = cfg.get("year")
        cer_path = cfg.get("cer_path")
        key_path = cfg.get("key_path")
        password = cfg.get("password")
        rfc = cfg.get("rfc")
        output_dir = cfg.get("output_dir", os.path.dirname(os.path.abspath(__file__)))
        format_type = cfg.get("format", "both")
        doc_type = cfg.get("doc_type") or cfg.get("type") or "todas"
        role = cfg.get("role") or cfg.get("direction") or "emisor"
    else:
        year = args.year
        cer_path = args.cer
        key_path = args.key
        password = args.password
        rfc = args.rfc
        output_dir = args.output or os.path.dirname(os.path.abspath(__file__))
        format_type = args.format or "both"
        doc_type = args.type or "todas"
        role = args.role or "emisor"

    if not all([year, cer_path, key_path, password, rfc]):
        emit({"type": "error", "error": "Faltan parámetros requeridos (year, cer, key, password, rfc)."})
        sys.exit(1)

    success = run_extraction(year, cer_path, key_path, password, rfc, output_dir, format_type=format_type, doc_type=doc_type, role=role)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
