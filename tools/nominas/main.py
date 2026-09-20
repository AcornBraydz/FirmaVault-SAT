import sys
import os
import time
import subprocess
import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.action_chains import ActionChains
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QLabel, QPushButton, QComboBox, QTextEdit, 
                             QProgressBar, QGroupBox, QHBoxLayout, QGridLayout, 
                             QFileDialog, QMessageBox, QSizePolicy, QSpacerItem,
                             QFormLayout, QFrame, QGraphicsOpacityEffect, QLineEdit, QInputDialog)
from PyQt6.QtCore import QThread, pyqtSignal, Qt, QPropertyAnimation, QRect
from PyQt6.QtGui import QFont

class MonthIndicator(QFrame):
    def __init__(self, month_name):
        super().__init__()
        self.setObjectName("month_card")
        self.setFixedSize(140, 100)
        self.setStyleSheet("""
            #month_card {
                background-color: #1c1c2c;
                border: 1px solid #353545;
                border-radius: 16px;
            }
        """)
        vbox = QVBoxLayout(self)
        vbox.setContentsMargins(12, 12, 12, 12)
        vbox.setSpacing(4)

        self.lbl_title = QLabel(month_name)
        self.lbl_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")
        self.lbl_title.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_status = QLabel("PENDIENTE")
        self.lbl_status.setStyleSheet("color: #555566; font-size: 11px; font-weight: bold; letter-spacing: 1px;")
        self.lbl_status.setAlignment(Qt.AlignmentFlag.AlignCenter)
        
        self.lbl_desc = QLabel("--")
        self.lbl_desc.setStyleSheet("color: #8e8e93; font-size: 11px; font-family: 'Consolas';")
        self.lbl_desc.setAlignment(Qt.AlignmentFlag.AlignCenter)

        vbox.addWidget(self.lbl_title)
        vbox.addStretch()
        vbox.addWidget(self.lbl_status)
        vbox.addWidget(self.lbl_desc)
        vbox.addStretch()

        self.op_effect = QGraphicsOpacityEffect(self)
        self.setGraphicsEffect(self.op_effect)
        self.anim = QPropertyAnimation(self.op_effect, b"opacity")
        self.anim.setDuration(600)
    
    def set_status(self, status, desc=""):
        self.lbl_desc.setText(desc)
        if status == "processing":
            self.lbl_status.setText("PROCESANDO")
            self.setStyleSheet("#month_card { background-color: #162545; border: 1px solid #007bff; border-radius: 12px; }")
            self.lbl_status.setStyleSheet("color: #00aaff; font-size: 10px; font-weight: bold;")
            self.lbl_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")
            self.anim.setStartValue(0.4)
            self.anim.setEndValue(1.0)
            self.anim.setLoopCount(-1)
            self.anim.start()
        elif status == "success":
            self.anim.stop()
            self.op_effect.setOpacity(1.0)
            self.lbl_status.setText("ÉXITO")
            self.setStyleSheet("#month_card { background-color: #153825; border: 1px solid #157347; border-radius: 12px; }")
            self.lbl_status.setStyleSheet("color: #28a745; font-size: 10px; font-weight: bold;")
            self.lbl_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")
        elif status == "info":
            self.anim.stop()
            self.op_effect.setOpacity(1.0)
            self.lbl_status.setText("SIN DATOS")
            self.setStyleSheet("#month_card { background-color: #2c2c36; border: 1px solid #555566; border-radius: 12px; }")
            self.lbl_status.setStyleSheet("color: #aaaaaa; font-size: 10px; font-weight: bold;")
            self.lbl_title.setStyleSheet("color: #dddddd; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")
        elif status == "error":
            self.anim.stop()
            self.op_effect.setOpacity(1.0)
            self.lbl_status.setText("ERROR")
            self.setStyleSheet("#month_card { background-color: #3b1b1b; border: 1px solid #dc3545; border-radius: 12px; }")
            self.lbl_status.setStyleSheet("color: #ff4c4c; font-size: 10px; font-weight: bold;")
            self.lbl_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")
        else:
            self.anim.stop()
            self.op_effect.setOpacity(1.0)
            self.lbl_status.setText("PENDIENTE")
            self.setStyleSheet("#month_card { background-color: #1c1c2c; border: 1px solid #353545; border-radius: 12px; }")
            self.lbl_status.setStyleSheet("color: #555566; font-size: 10px; font-weight: bold;")
            self.lbl_title.setStyleSheet("color: #ffffff; font-weight: bold; font-size: 14px; font-family: 'Segoe UI';")

# --- CONFIGURACIÓN GLOBAL ---
BRAVE_PATH = r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"
USER_DATA_DIR = r"C:\sel_brave_profile"
PORT = "9222"
SAT_URL = "https://portalcfdi.facturaelectronica.sat.gob.mx/"

# Eliminar RFCListener ya que unificaremos el inicio en el Worker

class Worker(QThread):
    progress_signal = pyqtSignal(int)
    log_signal = pyqtSignal(str)
    month_status_signal = pyqtSignal(int, str, str)
    rfc_signal = pyqtSignal(str)
    finished_signal = pyqtSignal()
    error_signal = pyqtSignal(str)

    def __init__(self, year, cer_path, key_path, password, manual_rfc=None):
        super().__init__()
        self.year = str(year)
        self.rfc_folder = manual_rfc or "" # Usar manual si existe
        self.cer_path = cer_path
        self.key_path = key_path
        self.password = password
        self.running = True
        self.data_report = []
        self.root_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

    def log_msg(self, msg):
        self.log_signal.emit(msg)

    def run(self):
        driver = None
        try:
            # 1. Limpiar rastro anterior
            if os.path.exists("error_log.txt"):
                with open("error_log.txt", "w", encoding="utf-8") as f: f.write("")
            for f in os.listdir("."):
                if f.startswith("debug_error_mes_") and f.endswith(".png"):
                    try: os.remove(f)
                    except: pass

            # 2. Abrir Brave automáticamente con un perfil efímero (temporal) en memoria
            # Esto evita congelamientos por puertos saturados, elimina procesos zombie,
            # y borra completamente el caché y las cookies al terminar, como requiere el SAT.
            self.log_msg("🚀 Iniciando Brave en segundo plano (Limpiando cookies)...")
            options = Options()
            options.binary_location = BRAVE_PATH
            options.add_argument("--headless=new")
            options.add_argument("--disable-gpu")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-popup-blocking")
            options.add_argument("--incognito")
            
            driver = webdriver.Chrome(options=options)
            wait = WebDriverWait(driver, 30) # Aumentar timeout general
            driver.get(SAT_URL)

            # -------- INICIO DE SESIÓN AUTOMATIZADO CON E.FIRMA --------
            self.log_signal.emit("🔑 Verificando estado de sesión...")
            
            driver.set_page_load_timeout(60) # Evitar que se quede colgado cargando infinitamente
            
            # Verificar si estamos en una página de "Sesión Terminada"
            try:
                if "terminado" in driver.page_source.lower():
                    self.log_signal.emit("⚠️ Sesión expirada detectada, recargando login...")
                    driver.get(SAT_URL)
                    time.sleep(3)
            except Exception as e:
                self.log_signal.emit(f"⚠️ Error al leer página: {e}")

            try:
                curr_url_init = driver.current_url.lower()
                if ("portalcfdi.facturaelectronica.sat.gob.mx" in curr_url_init and "cfdiau" not in curr_url_init) or \
                   driver.find_elements(By.ID, "DdlAnio") or driver.find_elements(By.ID, "ctl00_LblRfcAutenticado"):
                    self.log_signal.emit("✅ Sesión activa detectada.")
                else:
                    # Clic en "e.firma" si no estamos logueados
                    self.log_signal.emit("🛡️ Intentando login con e.firma...")
                    
                    if not (os.path.exists(self.cer_path) and os.path.exists(self.key_path)):
                        self.error_signal.emit("❌ Faltan archivos .cer o .key")
                        return

                    wait_login = WebDriverWait(driver, 20)
                    if not driver.find_elements(By.ID, "fileCertificate"):
                        try:
                            btn_fiel = wait_login.until(EC.element_to_be_clickable((By.ID, "buttonFiel")))
                            try:
                                btn_fiel.click()
                            except Exception:
                                driver.execute_script("arguments[0].click();", btn_fiel)
                        except Exception:
                            pass

                    # Localizar inputs - Asegurar que aparezcan
                    wait_login.until(EC.presence_of_element_located((By.ID, "fileCertificate")))
                    time.sleep(1)

                    input_cer = driver.find_element(By.ID, "fileCertificate")
                    input_key = driver.find_element(By.ID, "filePrivateKey")
                    input_pass = driver.find_element(By.ID, "privateKeyPassword")
                    
                    input_cer.send_keys(self.cer_path)
                    time.sleep(1)
                    input_key.send_keys(self.key_path)
                    time.sleep(1)
                    input_pass.clear()
                    input_pass.send_keys(self.password)
                    time.sleep(1)

                    btn_submit = driver.find_element(By.ID, "submit")
                    self.log_signal.emit("⏳ Enviando credenciales ante el SAT...")
                    try:
                        btn_submit.click()
                    except Exception:
                        try:
                            driver.execute_script("arguments[0].click();", btn_submit)
                        except Exception:
                            pass
                    
                    self.log_signal.emit("⏳ Validando autenticación...")
                    
                    # Esperar hasta 60s comprobando si hubo error o si ya ingresó
                    inicio_espera = time.time()
                    while time.time() - inicio_espera < 60:
                        time.sleep(1.5)
                        alertas = driver.find_elements(By.CSS_SELECTOR, ".alert-danger, #msgbox, #lblError")
                        for a in alertas:
                            if a.is_displayed() and a.text.strip():
                                self.error_signal.emit(f"📛 Error Login: {a.text[:100]}...")
                                return
                        try:
                            curr_u = driver.current_url.lower()
                            if ("portalcfdi.facturaelectronica.sat.gob.mx" in curr_u and "cfdiau" not in curr_u) or \
                               "consultareceptor.aspx" in curr_u or \
                               "default.aspx" in curr_u or \
                               driver.find_elements(By.ID, "DdlAnio") or \
                               driver.find_elements(By.ID, "ctl00_LblRfcAutenticado"):
                                break
                        except Exception:
                            pass
            except Exception as e:
                err_str = str(e)
                self.log_signal.emit(f"ℹ️ {err_str[:50]}...")

            # -------- DETECCIÓN DE RFC Y CARPETAS --------
            if self.rfc_folder:
                self.log_signal.emit(f"✅ Usando RFC manual: {self.rfc_folder}")
                rfc = self.rfc_folder
            else:
                self.log_signal.emit("🔍 Identificando RFC...")
                rfc = None
                try:
                    # Intentar con selectores conocidos
                    for rfc_id in ["ctl00_LblRfcAutenticado", "ctl00_lblRfc", "LblRfcAutenticado"]:
                        elems = driver.find_elements(By.ID, rfc_id)
                        if elems and ":" in elems[0].text:
                            rfc = elems[0].text.split(':')[-1].strip().upper()
                            break
                    
                    # Fallback: buscar cualquier elemento que parezca contener el RFC (patrón SAT)
                    if not rfc:
                        headers = driver.find_elements(By.XPATH, "//*[contains(text(), 'RFC Autenticado') or contains(text(), 'RFC:')]")
                        for h in headers:
                            if ":" in h.text:
                                possible_rfc = h.text.split(':')[-1].strip().upper()
                                if len(possible_rfc) >= 12: # Filtro básico para un RFC
                                    rfc = possible_rfc
                                    break
                    
                    # Si falló, intentar navegar directamente y ver si aparece ahí
                    if not rfc:
                        self.log_signal.emit("🧭 RFC no hallado en dashboard, intentando navegación directa...")
                        driver.get("https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx")
                        time.sleep(3)
                        elems = driver.find_elements(By.ID, "ctl00_LblRfcAutenticado")
                        if elems and ":" in elems[0].text:
                            rfc = elems[0].text.split(':')[-1].strip().upper()

                    if not rfc:
                        raise Exception("No se encontró el texto del RFC después de varios intentos.")
                    
                    self.rfc_folder = rfc
                    self.rfc_signal.emit(rfc)
                    self.log_signal.emit(f"✅ RFC Detectado: {rfc}")

                except Exception as e:
                    # Captura de pantalla para ver por qué falló la detección
                    driver.save_screenshot("debug_rfc_error.png")
                    self.error_signal.emit(f"❌ Error al detectar RFC: {str(e)[:100]}. Revisar debug_rfc_error.png")
                    return

            final_path = os.path.join(self.root_dir, self.rfc_folder, self.year)
            final_path_nominas = os.path.join(final_path, f"Descargas de Nominas {self.year}")
            os.makedirs(final_path_nominas, exist_ok=True)

            try:
                # Permiso global de descargas para Headless Chrome
                driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                    'behavior': 'allowAndName', 
                    'downloadPath': final_path_nominas,
                    'eventsEnabled': True
                })
            except: pass
            
            driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                'behavior': 'allow', 'downloadPath': final_path_nominas
            })
            
            # -------- NAVEGACIÓN AL MENÚ DE RECIBIDAS --------
            try:
                if "ConsultaReceptor.aspx" not in driver.current_url:
                    self.log_signal.emit("🧭 Navegando al menú de Consultar Recibidas...")
                    driver.get("https://portalcfdi.facturaelectronica.sat.gob.mx/ConsultaReceptor.aspx")
                    time.sleep(3)
                
                # Esperar a que los controles de búsqueda estén listos
                wait.until(EC.presence_of_element_located((By.ID, "ctl00_MainContent_RdoFechas")))
            except Exception as nav_e:
                self.log_signal.emit(f"⚠️ Error de navegación: {str(nav_e)}")

            try:
                label_fecha = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "label[for='ctl00_MainContent_RdoFechas']")))
                driver.execute_script("arguments[0].click();", label_fecha)
                time.sleep(2)
            except: pass

            meses = [str(m) for m in range(1, 13)]
            nombres_meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
            
            for i, mes_val in enumerate(meses):
                if not self.running: break
                mes_display = mes_val.zfill(2)
                nombre_mes = nombres_meses[i]
                
                # Crear carpeta específica para el mes
                final_path_mes = os.path.join(final_path_nominas, nombre_mes)
                os.makedirs(final_path_mes, exist_ok=True)
                
                self.progress_signal.emit(int((i / 12) * 100))
                self.month_status_signal.emit(i, "processing", "Buscando...")
                self.log_signal.emit(f"Consultando información para el mes de {mes_display}...")

                try:
                    # RE-ASEGURAR RUTA DE DESCARGA (ACTUALIZADA PARA EL MES)
                    try:
                        driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                            'behavior': 'allowAndName', 
                            'downloadPath': final_path_mes,
                            'eventsEnabled': True
                        })
                    except: pass
                    
                    driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                        'behavior': 'allow', 'downloadPath': final_path_mes
                    })
                    
                    # Robustez: Asegurar que los selectores están presentes
                    wait.until(EC.presence_of_element_located((By.ID, "DdlAnio")))
                    
                    Select(driver.find_element(By.ID, "DdlAnio")).select_by_value(self.year)
                    time.sleep(1)
                    Select(driver.find_element(By.ID, "ctl00_MainContent_CldFecha_DdlMes")).select_by_value(mes_val)
                    time.sleep(1)
                    
                    btn_buscar = driver.find_element(By.ID, "ctl00_MainContent_BtnBusqueda")
                    driver.execute_script("arguments[0].click();", btn_buscar)
                    
                    # Esperar a que la tabla cargue o aparezca el mensaje de "Sin registros"
                    time.sleep(4)

                    # Verificamos si hay un mensaje de "Sin registros" que esté visible
                    lbl_mensaje = driver.find_elements(By.ID, "ctl00_MainContent_lblMensajeDisp")
                    if lbl_mensaje and lbl_mensaje[0].is_displayed() and lbl_mensaje[0].text.strip() != "":
                        self.month_status_signal.emit(i, "info", "No hay facturas")
                        continue

                    # Esperar a que exista la tabla de resultados
                    WebDriverWait(driver, 5).until(EC.presence_of_element_located((By.ID, "ctl00_MainContent_tblResult")))
                    filas = driver.find_elements(By.XPATH, "//table[@id='ctl00_MainContent_tblResult']//tbody//tr")
                    
                    nominas_mes = []
                    for fila in filas:
                        if "RFC Emisor" in fila.text: continue # Omitir fila de encabezados si es que se atrapa
                        celdas = fila.find_elements(By.XPATH, "./td")
                        
                        if len(celdas) >= 16:
                            folio = celdas[1].text.strip()
                            if not folio or len(folio) < 30 or "-" not in folio:
                                continue
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
                                "Efecto del Comprobante": celdas[10].text.strip(),
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
                        
                        for idx_nom, item in enumerate(nominas_mes):
                            if not self.running: break
                            folio = item['Folio Fiscal']
                            rfc_emisor = item['RFC Emisor']
                            
                            # Crear subcarpeta para el Emisor específico dentro del Mes
                            final_path_emisor = os.path.join(final_path_mes, rfc_emisor)
                            os.makedirs(final_path_emisor, exist_ok=True)
                            
                            # Actualizar la ruta de descarga CDP para este archivo específico
                            try:
                                driver.execute_cdp_cmd('Browser.setDownloadBehavior', {
                                    'behavior': 'allowAndName', 
                                    'downloadPath': final_path_emisor,
                                    'eventsEnabled': True
                                })
                            except: pass
                            driver.execute_cdp_cmd('Page.setDownloadBehavior', {
                                'behavior': 'allow', 'downloadPath': final_path_emisor
                            })
                            
                            # Comprobar si ya existen PDF y XML en la carpeta del emisor
                            archivos_emisor = os.listdir(final_path_emisor)
                            tiene_pdf = any(folio.lower() in f.lower() and f.lower().endswith('.pdf') for f in archivos_emisor)
                            tiene_xml = any(folio.lower() in f.lower() and f.lower().endswith('.xml') for f in archivos_emisor)

                            if tiene_pdf and tiene_xml:
                                self.log_signal.emit(f"⏭️ Ya existen (PDF y XML): {folio}")
                                descargados += 1
                                continue
                            
                            self.log_signal.emit(f"📥 [{idx_nom+1}/{total_mes}] Descargando: {folio}")
                            
                            # --- 1. DESCARGA DE XML (BtnDescarga) ---
                            if not tiene_xml:
                                xml_confirmed = False
                                for intento in range(3):
                                    if not self.running: break
                                    try:
                                        btn_xml = item['elemento_fila'].find_element(By.XPATH, ".//span[@id='BtnDescarga'] | .//*[@id='BtnDescarga'] | .//span[contains(@id, 'BtnDescarga')]")
                                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn_xml)
                                        time.sleep(0.5)
                                        ActionChains(driver).move_to_element(btn_xml).click().perform()
                                    except Exception as e:
                                        self.log_signal.emit(f"⚠️ No se halló botón XML en {folio}")
                                        break

                                    for _ in range(30):
                                        if not self.running: break
                                        archivos = os.listdir(final_path_emisor)
                                        hay_xml = any(folio.lower() in f.lower() and f.lower().endswith('.xml') for f in archivos)
                                        hay_temp = any(folio.lower() in f.lower() and (f.lower().endswith('.crdownload') or f.lower().endswith('.tmp')) for f in archivos)
                                        if hay_xml and not hay_temp:
                                            xml_confirmed = True
                                            break
                                        time.sleep(0.5)

                                    if xml_confirmed:
                                        break
                                    time.sleep(1)

                            # --- 2. DESCARGA DE PDF (BtnRI) ---
                            if not tiene_pdf:
                                file_confirmed = False
                                for intento in range(3):  # hasta 3 intentos
                                    if not self.running: break
                                    
                                    try:
                                        btn_pdf = item['elemento_fila'].find_element(By.XPATH, ".//span[@id='BtnRI'] | .//*[@id='BtnRI'] | .//span[contains(@id, 'BtnRI')]")
                                        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", btn_pdf)
                                        time.sleep(0.5)
                                        
                                        ActionChains(driver).move_to_element(btn_pdf).click().perform()
                                        
                                        if intento > 0:
                                            self.log_signal.emit(f"🔄 Reintento {intento}: {folio}")
                                    except Exception as e:
                                        self.log_signal.emit(f"⚠️ No se halló BtnRI en {folio}")
                                        break
                                    
                                    for _ in range(40):
                                        if not self.running: break
                                        
                                        archivos = os.listdir(final_path_emisor)
                                        hay_pdf = any(folio.lower() in f.lower() and f.lower().endswith('.pdf') for f in archivos)
                                        hay_temp = any(folio.lower() in f.lower() and (f.lower().endswith('.crdownload') or f.lower().endswith('.tmp')) for f in archivos)
                                        
                                        if hay_pdf and not hay_temp:
                                            file_confirmed = True
                                            break
                                        time.sleep(0.5)

                                    # CERRAR LAS VENTANAS EXTRAS DESPUÉS DE LA DESCARGA O TIMEOUT
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
                                    
                                    if file_confirmed:
                                        break
                                    time.sleep(1.5)
                            
                            archivos_finales = os.listdir(final_path_emisor)
                            ok_pdf = any(folio.lower() in f.lower() and f.lower().endswith('.pdf') for f in archivos_finales)
                            ok_xml = any(folio.lower() in f.lower() and f.lower().endswith('.xml') for f in archivos_finales)

                            if ok_pdf or ok_xml:
                                descargados += 1
                                tag = "PDF + XML" if (ok_pdf and ok_xml) else ("PDF" if ok_pdf else "XML")
                                self.log_signal.emit(f"✅ Guardado ({tag}) [{descargados}/{total_mes}]: {folio}")
                            else:
                                self.log_signal.emit(f"❌ No llegó tras 3 intentos: {folio}")
                        
                        self.month_status_signal.emit(i, "success", f"{descargados}/{total_mes} nóminas")
                        self.data_report.extend(nominas_mes)
                    else:
                        self.month_status_signal.emit(i, "info", "Sin nóminas")
                except Exception as e:
                    import traceback
                    error_msg = traceback.format_exc()
                    shot_name = f"debug_error_mes_{mes_display}.png"
                    try:
                        driver.save_screenshot(shot_name)
                        log_extra = f" (Captura guardada: {shot_name})"
                    except: log_extra = ""
                    
                    with open("error_log.txt", "a", encoding="utf-8") as f:
                        f.write(f"\n--- ERROR MES {mes_display} ---\n{error_msg}\n")
                    
                    self.month_status_signal.emit(i, "error", "Fallo de lectura")
                    self.log_signal.emit(f"❌ Error en mes {mes_display}{log_extra}")
                    continue

            if self.data_report: self.crear_excel(final_path)
            self.progress_signal.emit(100)
            self.finished_signal.emit()
            os.startfile(final_path)
        except Exception as e: 
            import traceback
            error_trace = traceback.format_exc()
            try:
                with open("error_log.txt", "a") as f:
                    f.write(error_trace + "\n")
            except: pass
            self.error_signal.emit(str(e) + "\n\n(Revisa error_log.txt para más detalles)")
        finally:
            if driver:
                try: driver.quit()
                except: pass

    def crear_excel(self, folder):
        df = pd.DataFrame(self.data_report)
        if 'elemento_fila' in df.columns: df = df.drop(columns=['elemento_fila'])
        
        # Ordenar cronológicamente y por emisor
        df = df.sort_values(by=['Fecha de Emisión', 'Nombre o Razón Social del Emisor']).reset_index(drop=True)
        
        ruta = os.path.join(folder, f"Reporte_{self.rfc_folder}_{self.year}.xlsx")
        
        # Al extraer solo meses con datos, simplemente validamos el contenido del DF.
        with pd.ExcelWriter(ruta, engine='xlsxwriter') as writer:
            workbook = writer.book
            worksheet = workbook.add_worksheet('Datos')
            
            # Formatos
            formato_header = workbook.add_format({'bold': True, 'bg_color': '#D3D3D3', 'align': 'center', 'valign': 'vcenter', 'border': 1})
            formato_mes = workbook.add_format({'bold': True, 'bg_color': '#4A86E8', 'font_color': 'white', 'align': 'center', 'valign': 'vcenter', 'border': 1, 'size': 14})
            
            # Paleta de 10 colores pasteles distintivos
            colores_pasteles = ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#E8BAFF', '#FFBAF3', '#D4F0F0', '#FFC4C4', '#E2F0CB']
            
            emisores_unicos = df['Nombre o Razón Social del Emisor'].unique()
            mapa_colores = {emisor: colores_pasteles[i % len(colores_pasteles)] for i, emisor in enumerate(emisores_unicos)}
            
            # Escribir encabezados fijos
            for col_num, value in enumerate(df.columns.values):
                worksheet.write(0, col_num, value, formato_header)
                
            # Ajustar anchos centrados (usamos el texto máximo de las celdas + padding)
            for i, col in enumerate(df.columns):
                w = max(df[col].astype(str).map(len).max(), len(col)) + 4
                worksheet.set_column(i, i, w)
            
            meses_nombres = ["", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
            
            current_row_excel = 1
            mes_actual = None
            
            for row_num in range(len(df)):
                emisor = df.iloc[row_num].get('Nombre o Razón Social del Emisor', '')
                fecha = str(df.iloc[row_num].get('Fecha de Emisión', ''))
                
                # Extraer número de mes (01, 02...)
                mes_row = fecha[5:7] if pd.notna(fecha) and len(fecha) >= 7 else ""
                
                # Insertar separador de mes si cambió
                if mes_row != mes_actual and mes_row.isdigit():
                    mes_actual = mes_row
                    nombre_mes = meses_nombres[int(mes_row)]
                    
                    # Fusionar toda la fila con el nombre del mes
                    if len(df.columns) > 1:
                        worksheet.merge_range(current_row_excel, 0, current_row_excel, len(df.columns) - 1, nombre_mes, formato_mes)
                    else:
                        worksheet.write(current_row_excel, 0, nombre_mes, formato_mes)
                        
                    current_row_excel += 1 # Bajar a la siguiente fila para los datos
                
                color = mapa_colores.get(emisor, '#FFFFFF')
                formato_fila = workbook.add_format({'bg_color': color, 'align': 'center', 'valign': 'vcenter', 'border': 1})
                
                for col_num in range(len(df.columns)):
                    valor = df.iloc[row_num, col_num]
                    if pd.isna(valor): valor = ""
                    worksheet.write(current_row_excel, col_num, str(valor), formato_fila)
                    
                current_row_excel += 1

        self.log_signal.emit("✅ Reporte Excel listo y formateado.")

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("SAT Nóminas Pro")
        self.setMinimumSize(500, 920)
        self.setMaximumWidth(550)
        self.resize(550, 920)
        
        # Centrar la ventana en la pantalla
        qr = self.frameGeometry()
        cp = self.screen().availableGeometry().center()
        qr.moveCenter(cp)
        self.move(qr.topLeft())
        
        self.init_ui()

    def init_ui(self):
        self.setStyleSheet("""
            QMainWindow { background-color: #0f0f13; }
            * { font-family: 'Segoe UI', 'Roboto', sans-serif; font-size: 12px; color: #ffffff; }
            QGroupBox { 
                border: 1px solid #252535; 
                border-radius: 10px; 
                background-color: #161625;
                margin-top: 5px;
                padding: 10px;
            }
            QLabel { color: #8e8e93; font-weight: 500; }
            
            QLineEdit, QComboBox {
                background: #252535; 
                border: 1px solid #353545; 
                border-radius: 6px; 
                padding: 6px 10px; 
                color: white;
                font-size: 13px;
                min-height: 18px;
            }
            QComboBox {
                padding-left: 20px; /* Optional adjustment to help centering arrow offset */
            }
            QComboBox QAbstractItemView {
                background: #252535;
                selection-background-color: #007bff;
            }
            QLineEdit:focus, QComboBox:hover { border: 1px solid #007bff; background: #2a2a3e; }
            
            #rfc_display { 
                background: transparent; 
                border: 2px solid #007bff; 
                border-radius: 10px; 
                padding: 10px; 
                color: #ffffff; 
                font-weight: bold; 
                font-size: 22px; 
                font-family: 'Consolas', monospace;
                qproperty-alignment: 'AlignCenter';
            }
            
            /* COMBOBOX PREMIUM */
            QComboBox::drop-down { width: 0px; border: none; }
            QComboBox::down-arrow { image: none; }
            QComboBox QAbstractItemView {
                background-color: #1a1a2e;
                color: #ffffff;
                selection-background-color: #007bff;
                border: 1px solid #353545;
                border-radius: 8px;
                outline: none;
            }

            QPushButton { 
                padding: 8px 15px; 
                border-radius: 6px; 
                font-weight: bold; 
                font-size: 12px;
                text-transform: uppercase;
            }
            .btn_secundario { 
                background-color: #353545; 
                color: white; 
                font-size: 10px;
                padding: 6px 12px;
                border: 1px solid #454555;
            }
            .btn_secundario:hover { background-color: #454555; border: 1px solid #007bff; }

            #btn_iniciar { 
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #157347, stop:1 #1e9a5f);
                color: white; 
                border: none; 
                font-size: 15px;
                padding: 15px;
                border-bottom: 3px solid #0d4d2f;
            }
            #btn_iniciar:hover { background: #1fae6d; }
            #btn_iniciar:pressed { border-bottom: 1px solid #0d4d2f; margin-top: 2px; }
            #btn_iniciar:disabled { background: #1c1c2c; color: #444; border-bottom: none; }
            
            QProgressBar {
                background: #252535;
                border-radius: 4px;
                text-align: center;
                color: white;
                height: 6px;
                font-size: 9px;
            }
            QProgressBar::chunk { background-color: #007bff; border-radius: 4px; }
        """)
        
        self.rfc_manual_val = ""
        
        container = QWidget(); self.setCentralWidget(container)
        main_layout = QVBoxLayout(container)
        main_layout.setContentsMargins(30, 20, 30, 20); main_layout.setSpacing(15)

        self.group_datos = QGroupBox()
        layout_form = QFormLayout(self.group_datos)
        layout_form.setSpacing(10); layout_form.setHorizontalSpacing(15); layout_form.setContentsMargins(15, 10, 15, 10)
        layout_form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        
        # --- CAMPOS ---
        self.i_cer = QLineEdit(); self.i_cer.setPlaceholderText("Seleccionar archivo .cer..."); self.i_cer.setReadOnly(True)
        self.b_cer = QPushButton("BUSCAR"); self.b_cer.setProperty("class", "btn_secundario"); self.b_cer.setFixedWidth(70); self.b_cer.clicked.connect(self.seleccionar_cer)
        h_cer = QHBoxLayout(); h_cer.setSpacing(5); h_cer.addWidget(self.i_cer); h_cer.addWidget(self.b_cer)
        layout_form.addRow("Certificado (.cer):", h_cer)

        self.i_key = QLineEdit(); self.i_key.setPlaceholderText("Seleccionar archivo .key..."); self.i_key.setReadOnly(True)
        self.b_key = QPushButton("BUSCAR"); self.b_key.setProperty("class", "btn_secundario"); self.b_key.setFixedWidth(70); self.b_key.clicked.connect(self.seleccionar_key)
        h_key = QHBoxLayout(); h_key.setSpacing(5); h_key.addWidget(self.i_key); h_key.addWidget(self.b_key)
        layout_form.addRow("Clave Privada (.key):", h_key)

        self.i_pass = QLineEdit()
        self.i_pass.setPlaceholderText("Ingresar contraseña...")
        self.i_pass.setEchoMode(QLineEdit.EchoMode.Password)
        self.i_pass.setFixedHeight(35)

        self.b_toggle_pass = QPushButton("👁")
        self.b_toggle_pass.setProperty("class", "btn_secundario")
        self.b_toggle_pass.setFixedSize(35, 35)
        self.b_toggle_pass.setToolTip("Mostrar / Ocultar contraseña")
        self.b_toggle_pass.setCheckable(True)
        self.b_toggle_pass.clicked.connect(self._toggle_password_visibility)

        h_pass = QHBoxLayout()
        h_pass.setSpacing(5)
        h_pass.addWidget(self.i_pass)
        h_pass.addWidget(self.b_toggle_pass)
        layout_form.addRow("Contraseña:", h_pass)

        self.i_anio = QComboBox(); self.i_anio.setFixedHeight(35)
        # Años en orden descendente (2026 a 2011)
        anios = [str(y) for y in range(2026, 2010, -1)]
        self.i_anio.addItems(anios)
        
        # Centrar el texto en los items de la lista
        for i in range(self.i_anio.count()):
            self.i_anio.setItemData(i, Qt.AlignmentFlag.AlignCenter, Qt.ItemDataRole.TextAlignmentRole)
            
        layout_form.addRow("Año:", self.i_anio)

        self.lbl_rfc = QLineEdit(); self.lbl_rfc.setObjectName("rfc_display"); self.lbl_rfc.setReadOnly(True); self.lbl_rfc.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.lbl_rfc.setPlaceholderText("ESPERANDO RFC...")
        self.lbl_rfc.setFixedHeight(50)
        
        layout_form.addRow("RFC del Cliente:", self.lbl_rfc)
        
        main_layout.addWidget(self.group_datos)

        self.btn_run = QPushButton("INICIAR EXTRACCIÓN AUTOMATIZADA"); self.btn_run.setObjectName("btn_iniciar")
        self.btn_run.clicked.connect(self.iniciar_proceso)
        main_layout.addWidget(self.btn_run)

        self.prog = QProgressBar()
        main_layout.addWidget(self.prog)
        
        self.lbl_status_gral = QLabel("ESPERANDO...")
        self.lbl_status_gral.setStyleSheet("color: #8e8e93; font-family: 'Segoe UI'; font-size: 11px; font-weight: bold; letter-spacing: 1px;")
        self.lbl_status_gral.setAlignment(Qt.AlignmentFlag.AlignCenter)
        main_layout.addWidget(self.lbl_status_gral)

        self.group_meses = QGroupBox()
        self.group_meses.setStyleSheet("QGroupBox { border: none; padding: 0px; margin: 0px; background-color: transparent; }")
        
        # Usamos un layout horizontal para empujar el grid al centro
        h_layout_meses = QHBoxLayout(self.group_meses)
        h_layout_meses.setContentsMargins(0, 0, 0, 0)
        
        # Spacer izquierdo
        h_layout_meses.addItem(QSpacerItem(20, 20, QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum))
        
        # Grid central de 3x4 para ajustarse al ancho compacto
        grid_meses = QGridLayout()
        grid_meses.setSpacing(20)
        grid_meses.setContentsMargins(10, 10, 10, 10)
        
        self.meses_widgets = []
        nombres_meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", 
                         "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
        
        for i in range(12):
            w = MonthIndicator(nombres_meses[i])
            self.meses_widgets.append(w)
            grid_meses.addWidget(w, i // 3, i % 3)
            
        h_layout_meses.addLayout(grid_meses)
        
        # Spacer derecho
        h_layout_meses.addItem(QSpacerItem(20, 20, QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum))
            
        main_layout.addWidget(self.group_meses)
        main_layout.addStretch()

# Eliminar métodos obsoletos

    def _toggle_password_visibility(self, checked):
        if checked:
            self.i_pass.setEchoMode(QLineEdit.EchoMode.Normal)
            self.b_toggle_pass.setText("🙈")
        else:
            self.i_pass.setEchoMode(QLineEdit.EchoMode.Password)
            self.b_toggle_pass.setText("👁")

    def seleccionar_cer(self):
        filename, _ = QFileDialog.getOpenFileName(self, "Seleccionar Certificado", "", "Certificados (*.cer)")
        if filename: self.i_cer.setText(filename)

    def seleccionar_key(self):
        filename, _ = QFileDialog.getOpenFileName(self, "Seleccionar Clave Privada", "", "Claves (*.key)")
        if filename: self.i_key.setText(filename)

    def iniciar_proceso(self):
        if not self.i_cer.text() or not self.i_key.text() or not self.i_pass.text():
            QMessageBox.warning(self, "Faltan Datos", "Por favor ingresa la ubicación del Certificado, la Clave Privada y tu Contraseña.")
            return

        self.btn_run.setEnabled(False); self.lbl_status_gral.setText("INICIANDO..."); self.prog.setValue(0)
        for w in self.meses_widgets: w.set_status("pendiente", "--")
        self.worker = Worker(self.i_anio.currentText(),
                             self.i_cer.text(), self.i_key.text(), self.i_pass.text(),
                             manual_rfc=self.rfc_manual_val)
        self.worker.log_signal.connect(self.lbl_status_gral.setText)
        self.worker.month_status_signal.connect(self.actualizar_mes)
        self.worker.rfc_signal.connect(self.lbl_rfc.setText)
        self.worker.progress_signal.connect(self.prog.setValue)
        self.worker.finished_signal.connect(self.finalizar)
        self.worker.error_signal.connect(self.mostrar_error)
        self.worker.start()

    def actualizar_mes(self, idx, status, desc):
        self.meses_widgets[idx].set_status(status, desc)

    def mostrar_error(self, e):
        self.btn_run.setEnabled(True)
        QMessageBox.critical(self, "Error", e)

    def finalizar(self):
        self.btn_run.setEnabled(True)
        self.btn_run.setText("INICIAR NUEVA EXTRACCIÓN")
        self.lbl_status_gral.setStyleSheet("color: #28a745; font-family: 'Segoe UI'; font-size: 14px; font-weight: bold; letter-spacing: 2px;")
        self.lbl_status_gral.setText("   EXTRACCIÓN COMPLETADA EXITOSAMENTE")

if __name__ == "__main__":
    app = QApplication(sys.argv); win = MainWindow(); win.show(); sys.exit(app.exec())