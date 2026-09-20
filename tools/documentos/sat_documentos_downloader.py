import sys
import os
import json
import time
import base64
import argparse

# Parche SSL: login.siat.sat.gob.mx usa claves DH débiles que Python 3.14 rechaza.
# Reducimos SECLEVEL a 1 para permitir la conexión al portal del SAT.
try:
    import urllib3.util.ssl_
    _orig_ssl_wrap = urllib3.util.ssl_._ssl_wrap_socket_impl
    def _patched_ssl_wrap(sock, ssl_context, tls_in_tls, server_hostname=None):
        try:
            ssl_context.set_ciphers('DEFAULT@SECLEVEL=1')
        except Exception:
            pass
        return _orig_ssl_wrap(sock, ssl_context, tls_in_tls, server_hostname)
    urllib3.util.ssl_._ssl_wrap_socket_impl = _patched_ssl_wrap

    import requests
    _orig_session_req = requests.Session.request
    def _patched_session_req(self, method, url, **kwargs):
        if 'timeout' not in kwargs:
            kwargs['timeout'] = 15
        return _orig_session_req(self, method, url, **kwargs)
    requests.Session.request = _patched_session_req
except Exception:
    pass

try:
    from satcfdi.portal import Signer, SATPortalConstancia, SATPortalOpinionCumplimiento
    from satcfdi.portal.utils import get_form, request_ref_headers
except ImportError:
    Signer = None
    SATPortalConstancia = None
    SATPortalOpinionCumplimiento = None
    get_form = None
    request_ref_headers = None

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

def get_downloads_folder():
    user_home = os.path.expanduser("~")
    downloads = os.path.join(user_home, "Downloads")
    if not os.path.exists(downloads):
        downloads = os.path.join(user_home, "Descargas")
    if not os.path.exists(downloads):
        downloads = user_home
    return downloads

def create_chrome_driver(download_dir):
    options = Options()
    options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36")

    prefs = {
        "download.default_directory": download_dir,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True,
        "safebrowsing.enabled": True,
        "profile.default_content_settings.popups": 0,
        "profile.default_content_setting_values.popups": 1
    }
    options.add_experimental_option("prefs", prefs)

    driver = webdriver.Chrome(options=options)
    driver.execute_cdp_cmd("Page.setDownloadBehavior", {
        "behavior": "allow",
        "downloadPath": download_dir
    })
    return driver

def fill_fiel_and_submit(driver, cer_path, key_path, password):
    # En algunas URLs el botón buttonFiel está presente como pestaña. En otras (como lanzador CSF), ya está en modo FIEL directamente.
    try:
        btn_fiel = WebDriverWait(driver, 3).until(EC.element_to_be_clickable((By.ID, "buttonFiel")))
        btn_fiel.click()
        time.sleep(1.5)
    except Exception:
        pass

    input_cer = WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.ID, "fileCertificate")))
    input_key = driver.find_element(By.ID, "filePrivateKey")
    input_pass = driver.find_element(By.ID, "privateKeyPassword")

    input_cer.send_keys(cer_path)
    driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_cer)
    time.sleep(1.5)

    input_key.send_keys(key_path)
    driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_key)
    time.sleep(1.5)

    input_pass.clear()
    input_pass.send_keys(password)
    driver.execute_script("arguments[0].dispatchEvent(new Event('change', { bubbles: true }));", input_pass)
    time.sleep(1.5)

    # Validar que los campos estén listos
    for _ in range(12):
        c = driver.find_element(By.ID, "txtCertificate").get_attribute("value") or ""
        k = driver.find_element(By.ID, "txtPrivateKey").get_attribute("value") or ""
        r = driver.find_element(By.ID, "rfc").get_attribute("value") or ""
        if c and k and len(r) >= 10:
            break
        time.sleep(1)

    # Descartar alertas previas
    try:
        alert = driver.switch_to.alert
        alert.accept()
    except Exception:
        pass

    submit_btn = driver.find_element(By.ID, "submit")
    driver.execute_script("arguments[0].click();", submit_btn)

def download_32d_real(cer_path, key_path, password, output_path=None, max_timeout=180):
    cer_path = os.path.abspath(cer_path)
    key_path = os.path.abspath(key_path)
    downloads_dir = get_downloads_folder()
    final_dest = output_path or os.path.join(downloads_dir, "Opinion_Cumplimiento_32D_Oficial.pdf")

    # Método 1: Descarga directa oficial mediante satcfdi (SAML + OAuth2 nativo)
    if Signer is not None and SATPortalOpinionCumplimiento is not None:
        try:
            print(json.dumps({"type": "log", "msg": "Conectando al portal oficial del SAT (32-D)..."}), flush=True)
            with open(cer_path, "rb") as f_c:
                cer_bytes = f_c.read()
            with open(key_path, "rb") as f_k:
                key_bytes = f_k.read()
            signer = Signer.load(certificate=cer_bytes, key=key_bytes, password=password)
            portal_32d = SATPortalOpinionCumplimiento(signer=signer)
            pdf_bytes = portal_32d.generar_opinion_cumplimiento()
            if pdf_bytes and len(pdf_bytes) > 1000 and pdf_bytes.startswith(b"%PDF"):
                with open(final_dest, "wb") as f_out:
                    f_out.write(pdf_bytes)
                file_size = len(pdf_bytes)
                print(json.dumps({"type": "log", "msg": f"Opinión de Cumplimiento 32-D descargada exitosamente ({file_size} bytes)."}), flush=True)
                return {
                    "success": True,
                    "document": "32D",
                    "path": final_dest,
                    "filename": os.path.basename(final_dest),
                    "size": file_size
                }
        except Exception as e:
            print(json.dumps({"type": "log", "msg": f"Conexión directa: {e}. Iniciando método con navegador..."}), flush=True)

    # Método 2: Navegador Chrome headless
    driver = create_chrome_driver(downloads_dir)
    try:
        url = "https://ptsc32d.clouda.sat.gob.mx/?/reporteOpinion32DContribuyente"
        print(json.dumps({"type": "log", "msg": f"Conectando al portal oficial del SAT ({url})..."}), flush=True)
        driver.get(url)
        time.sleep(2.5)

        print(json.dumps({"type": "log", "msg": "Autenticando e.firma en servidor del SAT..."}), flush=True)
        fill_fiel_and_submit(driver, cer_path, key_path, password)

        print(json.dumps({"type": "log", "msg": "Esperando procesamiento del documento oficial en servidores del SAT..."}), flush=True)
        
        saved_file = None
        start_time = time.time()
        poll_count = 0

        while time.time() - start_time < max_timeout:
            time.sleep(2)
            poll_count += 1
            elapsed = int(time.time() - start_time)

            try:
                alert = driver.switch_to.alert
                alert_text = alert.text
                alert.accept()
                if any(w in alert_text.lower() for w in ["incorrecta", "revocad", "invalido", "no es valido", "vencid"]):
                    raise RuntimeError(f"El portal del SAT rechazó la e.firma: {alert_text}")
            except Exception as e:
                if "rechazó la e.firma" in str(e):
                    raise e

            downloaded = os.listdir(downloads_dir)
            pdf_files = [f for f in downloaded if f.endswith(".pdf") and not f.endswith(".crdownload") and "descarga" in f.lower()]
            if pdf_files:
                saved_file = os.path.join(downloads_dir, pdf_files[0])
                break

            try:
                res = driver.execute_script("""
                    const results = [];
                    document.querySelectorAll('a').forEach(a => {
                        if (a.href && (a.href.startsWith('data:application/pdf') || a.href.startsWith('blob:'))) {
                            results.push({tag: 'a', href: a.href});
                        }
                    });
                    document.querySelectorAll('embed, object, iframe').forEach(el => {
                        const src = el.src || el.data;
                        if (src && (src.startsWith('data:application/pdf') || src.startsWith('blob:') || src.includes('.pdf'))) {
                            results.push({tag: el.tagName, src: src});
                        }
                    });
                    return results;
                """)

                if res:
                    for item in res:
                        href = item.get("href") or item.get("src") or ""
                        if href.startswith("data:application/pdf;base64,"):
                            b64_data = href.split(",")[1]
                            dest = output_path or os.path.join(downloads_dir, "Opinion_Cumplimiento_32D_Oficial.pdf")
                            with open(dest, "wb") as f_pdf:
                                f_pdf.write(base64.b64decode(b64_data))
                            saved_file = dest
                            break
                    if saved_file:
                        break
            except:
                pass

            if poll_count % 4 == 0:
                print(json.dumps({"type": "log", "msg": f"[{elapsed}s] El SAT continúa procesando la consulta oficial..."}), flush=True)

        if not saved_file or not os.path.exists(saved_file):
            raise RuntimeError(f"El servidor del SAT tardó más de {max_timeout} segundos en responder o no entregó el PDF oficial. Por favor intenta de nuevo en unos momentos.")

        if saved_file != final_dest and os.path.exists(saved_file):
            if os.path.exists(final_dest):
                try: os.remove(final_dest)
                except: pass
            os.replace(saved_file, final_dest)

        file_size = os.path.getsize(final_dest)
        print(json.dumps({"type": "log", "msg": f"Documento oficial SAT descargado exitosamente ({file_size} bytes)."}), flush=True)
        return {
            "success": True,
            "document": "32D",
            "path": final_dest,
            "filename": os.path.basename(final_dest),
            "size": file_size
        }

    finally:
        driver.quit()

def download_csf_real(cer_path, key_path, password, output_path=None):
    cer_path = os.path.abspath(cer_path)
    key_path = os.path.abspath(key_path)
    downloads_dir = get_downloads_folder()
    final_dest = output_path or os.path.join(downloads_dir, "Constancia_Situacion_Fiscal_Oficial.pdf")

    # Método 1: API Directa paso a paso (evita el assert interno de generar_constancia)
    if Signer is not None and SATPortalConstancia is not None and get_form is not None:
        with open(cer_path, "rb") as f_c:
            cer_bytes = f_c.read()
        with open(key_path, "rb") as f_k:
            key_bytes = f_k.read()
        signer = Signer.load(certificate=cer_bytes, key=key_bytes, password=password)

        # Reintentar hasta 3 veces (el SAT a veces devuelve 403 intermitente en ACS POST)
        for attempt in range(1, 4):
            try:
                print(json.dumps({"type": "log", "msg": f"Intento {attempt}/3: Autenticando en portal oficial del SAT (Constancia CSF)..."}), flush=True)
                portal = SATPortalConstancia(signer=signer)
                portal.login()

                res = portal.get(
                    url="https://rfcampc.siat.sat.gob.mx/app/seg/SessionBroker?url=/PTSC/IdcSiat/autc/ReimpresionTramite/ConsultaTramite.jsf&parametro=c&idSessionBit=&idSessionBit=null",
                    allow_redirects=True
                )
                action, data = get_form(res)

                if action and "saml2/sso" in action:
                    res = portal.form(action, res.url, data)
                    action, data = get_form(res)
                    if action and "saml2/sp/acs/post" in action:
                        try:
                            res = portal.form(action, res.url, data)
                        except AssertionError:
                            res = portal.post(action, headers={"referer": res.url}, data=data, allow_redirects=True)
                        action, data = get_form(res)

                if action and "ConsultaTramite.jsf" in action:
                    print(json.dumps({"type": "log", "msg": "Generando documento oficial en servidores del SAT..."}), flush=True)
                    ajax_data = {
                        'javax.faces.partial.ajax': "true",
                        'javax.faces.source': 'formReimpAcuse:j_idt50',
                        'javax.faces.partial.execute': '@all',
                        'formReimpAcuse:j_idt50': 'formReimpAcuse:j_idt50',
                        'formReimpAcuse': 'formReimpAcuse',
                        'formReimpAcuse:tipoTramite_input': '0',
                        'formReimpAcuse:tipoTramite_focus': '',
                        'formReimpAcuse:fechaInicio_input:': '',
                        'formReimpAcuse:fechaFin_input': '',
                        'formReimpAcuse:folio': '',
                        'javax.faces.ViewState': data.get('javax.faces.ViewState', '')
                    }
                    headers = request_ref_headers(res.url) if request_ref_headers else {"referer": res.url}
                    portal.post(action, headers=headers, data=ajax_data)

                res_pdf = portal.get('https://rfcampc.siat.sat.gob.mx/PTSC/IdcSiat/IdcGeneraConstancia.jsf')
                if res_pdf.status_code == 200 and res_pdf.content.startswith(b"%PDF") and len(res_pdf.content) > 1000:
                    with open(final_dest, "wb") as f_out:
                        f_out.write(res_pdf.content)
                    file_size = len(res_pdf.content)
                    print(json.dumps({"type": "log", "msg": f"Constancia de Situación Fiscal oficial descargada exitosamente ({file_size} bytes)."}), flush=True)
                    return {
                        "success": True,
                        "document": "CSF",
                        "path": final_dest,
                        "filename": os.path.basename(final_dest),
                        "size": file_size
                    }
                else:
                    print(json.dumps({"type": "log", "msg": f"Intento {attempt}: No devolvió PDF válido (len {len(res_pdf.content)}). Reintentando..."}), flush=True)
            except Exception as e:
                import traceback
                print(json.dumps({"type": "log", "msg": f"Intento {attempt} CSF error: {type(e).__name__}: {e}"}), flush=True)

            if attempt < 3:
                time.sleep(3)

    # Método 2: Navegador Chrome headless (fallback)
    driver = create_chrome_driver(downloads_dir)
    try:
        url = "https://wwwmat.sat.gob.mx/aplicacion/login/43824/reimprime-tus-acuses-del-rfc"
        print(json.dumps({"type": "log", "msg": "Navegando a portal del SAT (navegador)..."}), flush=True)
        driver.get(url)
        time.sleep(3)

        # Buscar y cambiar al iframe de autenticación
        iframes = driver.find_elements(By.TAG_NAME, "iframe")
        if iframes:
            print(json.dumps({"type": "log", "msg": "Cambiando al iframe de autenticación..."}), flush=True)
            driver.switch_to.frame(iframes[0])

        print(json.dumps({"type": "log", "msg": "Autenticando con e.firma..."}), flush=True)
        fill_fiel_and_submit(driver, cer_path, key_path, password)
        time.sleep(3)

        print(json.dumps({"type": "log", "msg": "Esperando generación del documento oficial en servidores del SAT..."}), flush=True)
        saved_file = None
        
        click_script = """
            const elems = Array.from(document.querySelectorAll('button, input, a, span, div'));
            for (const b of elems) {
                const t = (b.innerText || b.value || b.id || '').toLowerCase();
                if (t.includes('generar constancia') || t.includes('constancia') || (b.id && b.id.includes('j_idt50'))) {
                    b.click();
                    return true;
                }
            }
            return false;
        """

        for step in range(1, 30):
            time.sleep(2)
            downloaded = os.listdir(downloads_dir)
            now = time.time()
            pdf_files = [f for f in downloaded if f.endswith(".pdf") and not f.endswith(".crdownload")]
            recent_pdfs = [os.path.join(downloads_dir, f) for f in pdf_files if now - os.path.getmtime(os.path.join(downloads_dir, f)) < 120]
            if recent_pdfs:
                saved_file = recent_pdfs[0]
                break

            # Try clicking in main document
            try:
                driver.switch_to.default_content()
                if driver.execute_script(click_script):
                    time.sleep(5)
                    continue
            except Exception:
                pass

            # Try clicking inside any iframe
            try:
                iframes = driver.find_elements(By.TAG_NAME, "iframe")
                for frame in iframes:
                    try:
                        driver.switch_to.frame(frame)
                        if driver.execute_script(click_script):
                            time.sleep(5)
                            break
                    except Exception:
                        pass
                    finally:
                        driver.switch_to.default_content()
            except Exception:
                pass

        if not saved_file:
            downloaded = os.listdir(downloads_dir)
            pdf_files = [f for f in downloaded if f.endswith(".pdf") and not f.endswith(".crdownload")]
            now = time.time()
            recent_pdfs = [os.path.join(downloads_dir, f) for f in pdf_files if now - os.path.getmtime(os.path.join(downloads_dir, f)) < 120]
            if recent_pdfs:
                saved_file = recent_pdfs[0]

        if not saved_file or not os.path.exists(saved_file):
            raise RuntimeError("No se pudo obtener la Constancia de Situación Fiscal automáticamente desde el SAT. Por favor reintente.")

        if saved_file != final_dest and os.path.exists(saved_file):
            if os.path.exists(final_dest):
                try: os.remove(final_dest)
                except: pass
            os.replace(saved_file, final_dest)

        file_size = os.path.getsize(final_dest)
        print(json.dumps({"type": "log", "msg": f"Constancia oficial del SAT descargada exitosamente ({file_size} bytes)."}), flush=True)
        return {
            "success": True,
            "document": "CSF",
            "path": final_dest,
            "filename": os.path.basename(final_dest),
            "size": file_size
        }

    finally:
        driver.quit()

def main():
    parser = argparse.ArgumentParser(description="SAT Documentos Oficiales Downloader")
    parser.add_argument("--config", help="Ruta al archivo JSON de configuracion")
    parser.add_argument("--type", choices=["32d", "csf"], help="Tipo de documento")
    parser.add_argument("--cer", help="Ruta al archivo .cer")
    parser.add_argument("--key", help="Ruta al archivo .key")
    parser.add_argument("--password", help="Contraseña de la e.firma")
    parser.add_argument("--output", help="Ruta de destino del archivo PDF")

    args = parser.parse_args()
    
    if args.config:
        with open(args.config, "r", encoding="utf-8") as f:
            cfg = json.load(f)
        doc_type = cfg.get("type")
        cer_path = cfg.get("cer")
        key_path = cfg.get("key")
        password = cfg.get("password")
        output_path = cfg.get("output")
    else:
        doc_type = args.type
        cer_path = args.cer
        key_path = args.key
        password = args.password
        output_path = args.output

    if not all([doc_type, cer_path, key_path, password]):
        print(json.dumps({"error": "Faltan parametros requeridos."}))
        sys.exit(1)

    if doc_type == "32d":
        res = download_32d_real(cer_path, key_path, password, output_path)
        print(json.dumps(res))
    elif doc_type == "csf":
        res = download_csf_real(cer_path, key_path, password, output_path)
        print(json.dumps(res))

if __name__ == "__main__":
    main()
