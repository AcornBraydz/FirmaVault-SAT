import React, { useState, useEffect, useCallback, useRef } from 'react';
import Cropper from 'react-easy-crop';
import getCroppedImg from './utils';
import ClientPortal, { LiveClock } from './ClientPortal';

// ============================================================
// Auth Helper
// ============================================================
function getToken() {
  return localStorage.getItem('firmavault_token');
}

function setToken(token) {
  localStorage.setItem('firmavault_token', token);
}

function clearToken() {
  localStorage.removeItem('firmavault_token');
}

async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...options.headers };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  // Only set Content-Type for JSON bodies (not FormData)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
    throw new Error('Sesión expirada');
  }
  return res;
}

// ============================================================
// Login Screen
// ============================================================
function LoginScreen({ onLogin }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Ingresa la contraseña');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error de autenticación');
      }
      setToken(data.token);
      onLogin();
    } catch (err) {
      if (err.name === 'TypeError' && (err.message.includes('fetch') || err.message.includes('NetworkError'))) {
        setError('No se pudo conectar con el servidor backend. Asegúrate de que el servidor esté en ejecución.');
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-baseline gap-1 mb-3">
            <span className="text-[28px] font-black tracking-[-0.03em] text-slate-900">
              Firma<span className="font-light text-slate-500">Vault</span>
            </span>
            <span className="w-2 h-2 rounded-full bg-slate-900 inline-block"></span>
            <span className="ml-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-widest uppercase bg-slate-900 text-white">
              SAT
            </span>
          </div>
          <p className="text-sm text-slate-500 font-medium">Gestión Segura de Credenciales e.firma</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          <div className="p-8 pb-6">
            <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-5 shadow-lg">
              <span className="material-symbols-outlined text-white text-[28px]">lock</span>
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-1">Acceso al Sistema</h1>
            <p className="text-sm text-slate-500 mb-6">Ingresa la contraseña maestra para continuar</p>

            {error && (
              <div className="mb-4 px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-sm text-rose-700 font-medium animate-in fade-in duration-200">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {error}
              </div>
            )}

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[20px] text-slate-400">key</span>
              <input type="text" name="username" value="admin" style={{ display: 'none' }} autoComplete="username" readOnly />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                className="w-full pl-10 pr-12 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:bg-white transition-all"
                placeholder="Contraseña maestra"
                autoFocus
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
              </button>
            </div>
          </div>

          <div className="px-8 py-4 bg-slate-50/80 border-t border-slate-100">
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white text-sm font-semibold rounded-xl transition-all duration-150 active:scale-[0.98] shadow-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                  Verificando...
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">login</span>
                  Ingresar
                </>
              )}
            </button>
          </div>
        </form>

        <p className="text-center text-[11px] text-slate-400 font-medium mt-6">
          Sistema protegido con cifrado AES-256 y autenticación JWT
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function ImageCropperModal({ imageSrc, onCropComplete, onCancel }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const onCropCompleteInternal = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleSave = async () => {
    setIsProcessing(true);
    try {
      const croppedImageBase64 = await getCroppedImg(imageSrc, croppedAreaPixels, 0);
      onCropComplete(croppedImageBase64);
    } catch (e) {
      console.error(e);
      alert('Error al recortar la imagen');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[450px] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Ajustar Fotografía</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-700">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="relative w-full h-[300px] bg-slate-900">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="rect"
            showGrid={false}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteInternal}
            onZoomChange={setZoom}
          />
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold text-slate-700 mb-2 block">Acercar / Alejar</label>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(e.target.value)}
              className="w-full accent-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              {isProcessing ? 'Recortando...' : 'Aplicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyButton({ client, password: directPassword, showToast }) {
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCopy = async () => {
    if (loading) return;
    if (directPassword) {
      navigator.clipboard.writeText(directPassword);
      setCopied(true);
      if (showToast) showToast('Contraseña de e.firma copiada al portapapeles', 'success');
      setTimeout(() => setCopied(false), 2000);
      return;
    }

    if (!client?.id) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/clients/${client.id}/reveal-password`, { method: 'POST' });
      const data = await res.json();
      if (data.success && data.password) {
        await navigator.clipboard.writeText(data.password);
        setCopied(true);
        if (showToast) showToast('Contraseña de e.firma copiada (Acceso auditado)', 'success');
        setTimeout(() => setCopied(false), 2000);
      } else {
        if (showToast) showToast(data.error || 'No se pudo obtener la contraseña', 'error');
      }
    } catch (e) {
      if (showToast) showToast('Error al obtener la contraseña del servidor', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleCopy}
      title={loading ? 'Consultando...' : 'Copiar Contraseña e.firma (Auditado)'}
      disabled={loading}
      className={`group relative inline-flex items-center justify-center w-[84px] h-7 rounded-md transition-all duration-300 font-medium shadow-sm border overflow-hidden cursor-pointer ${copied
        ? 'text-emerald-700 bg-emerald-100 border-emerald-300'
        : 'text-slate-600 hover:text-slate-900 bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300'
        }`}
      type="button"
    >
      <div className={`flex items-center justify-center transition-all duration-300 ${copied ? 'opacity-0 scale-50 absolute' : 'opacity-100 scale-100'}`}>
        <span className={`material-symbols-outlined text-[18px] group-hover:scale-110 transition-transform ${loading ? 'animate-spin' : ''}`}>
          {loading ? 'sync' : 'password'}
        </span>
      </div>
      <div className={`flex items-center justify-center gap-1.5 transition-all duration-300 absolute ${copied ? 'opacity-100 scale-100' : 'opacity-0 scale-150'}`}>
        <span className="material-symbols-outlined text-[14px]">check_circle</span>
        <span className="text-[11px] font-mono font-bold">copiado</span>
      </div>
    </button>
  );
}


function InlineCopyButton({ text, label, showToast }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e) => {
    e.stopPropagation();
    const onSuccess = () => {
      setCopied(true);
      if (showToast) showToast(`${label} copiado`);
      setTimeout(() => setCopied(false), 2000);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onSuccess).catch(() => {
        fallbackCopy(text);
        onSuccess();
      });
    } else {
      fallbackCopy(text);
      onSuccess();
    }
  };

  const fallbackCopy = (str) => {
    const el = document.createElement('textarea');
    el.value = str;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
  };

  return (
    <button
      onClick={handleCopy}
      title={`Copiar ${label}`}
      type="button"
      className={`inline-flex items-center justify-center w-5 h-5 rounded cursor-pointer transition-all duration-200 shrink-0 ${
        copied
          ? 'text-emerald-600 bg-emerald-50 scale-110 opacity-100'
          : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover/copy:opacity-100'
      }`}
    >
      <span className="material-symbols-outlined text-[13px]">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  );
}

function DescargaButton({ id, rfc, hasCsd, showToast }) {
  const [status, setStatus] = useState('idle');

  const handleDownload = async () => {
    if (status === 'downloading') return;
    setStatus('downloading');
    if (showToast) {
      showToast(
        hasCsd
          ? 'Preparando descarga organizada: e.firma y CSD en carpetas independientes...'
          : 'Preparando descarga de credenciales e.firma...',
        'info'
      );
    }
    try {
      const res = await authFetch(`/api/clients/${id}/download`);
      if (!res.ok) throw new Error('Error al descargar');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Credenciales_${rfc}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setStatus('done');
      if (showToast) {
        showToast(
          hasCsd
            ? 'Descarga completa: ZIP estructurado con carpetas e.firma y CSD'
            : 'Descarga de credenciales e.firma completada',
          'success'
        );
      }
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error(err);
      setStatus('idle');
      if (showToast) showToast('Error al descargar el paquete de credenciales', 'error');
    }
  };

  return (
    <button
      onClick={handleDownload}
      title={hasCsd ? "Descargar Credenciales (e.firma y CSD en carpetas separadas)" : "Descargar e.firma (.cer, .key y contraseña)"}
      className={`inline-flex items-center justify-center w-8 h-8 rounded border transition-all cursor-pointer shadow-sm relative group ${status === 'done'
        ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
        : 'bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300'
        }`}
    >
      <span className={`material-symbols-outlined text-[18px] ${status === 'downloading' ? 'animate-bounce text-indigo-500' : ''}`}>
        {status === 'done' ? 'check_circle' : 'download'}
      </span>
      {hasCsd && status !== 'done' && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" title="Incluye CSD" />
      )}
    </button>
  );
}

function PortalClienteButton({ client, onOpenPortal }) {
  return (
    <button
      onClick={() => onOpenPortal(client)}
      title="Portal del Cliente"
      aria-label="Portal del Cliente"
      className="inline-flex items-center justify-center w-8 h-8 rounded border bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
    >
      <span className="material-symbols-outlined text-[18px]">account_circle</span>
    </button>
  );
}

function AjustesButton({ client, onDelete, onUpdate, showToast }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [photoSrc, setPhotoSrc] = useState(client.photo || null);
  const [cropImageSrc, setCropImageSrc] = useState(null);

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      let imageDataUrl = await readFile(file);
      setCropImageSrc(imageDataUrl);
    }
  };

  const readFile = (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.addEventListener('load', () => resolve(reader.result), false);
      reader.readAsDataURL(file);
    });
  };

  const onCropComplete = async (croppedImageBase64) => {
    setCropImageSrc(null);
    setPhotoSrc(croppedImageBase64);

    // Auto-save the photo
    try {
      await authFetch(`/api/clients/${client.id}/photo`, {
        method: 'PUT',
        body: JSON.stringify({ photo: croppedImageBase64 })
      });
      if (onUpdate) onUpdate();
      showToast('Fotografía actualizada con éxito', 'success');
    } catch (e) {
      console.error(e);
      showToast('Error guardando la fotografía', 'error');
    }
  };

  const [activeTab, setActiveTab] = useState('fiel'); // 'fiel' | 'csd'
  const currentCsd = client.csdCertificates?.[0] || null;

  const [selectedCerFile, setSelectedCerFile] = useState(null);
  const [selectedKeyFile, setSelectedKeyFile] = useState(null);
  const [editedPassword, setEditedPassword] = useState(client.password || '');
  const [isSaving, setIsSaving] = useState(false);

  // CSD Form State
  const [csdCerFile, setCsdCerFile] = useState(null);
  const [csdKeyFile, setCsdKeyFile] = useState(null);
  const [csdPassword, setCsdPassword] = useState('');
  const [showCsdPassword, setShowCsdPassword] = useState(false);
  const [csdError, setCsdError] = useState('');
  const [isSavingCsd, setIsSavingCsd] = useState(false);
  const [isReplacingCsd, setIsReplacingCsd] = useState(false);
  const [isDeletingCsd, setIsDeletingCsd] = useState(false);
  const [isConfirmDeleteCsd, setIsConfirmDeleteCsd] = useState(false);

  const clientInitials = client.name
    ? client.name.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase()
    : (client.rfc ? client.rfc.slice(0, 2).toUpperCase() : 'ST');

  // Mantener sincronizados los campos si cambia el cliente o al abrir el drawer
  useEffect(() => {
    setPhotoSrc(client.photo || null);
    setEditedPassword(client.password || '');
    setSelectedCerFile(null);
    setSelectedKeyFile(null);
    setPasswordError('');
    setCsdCerFile(null);
    setCsdKeyFile(null);
    setCsdPassword('');
    setCsdError('');
    setIsReplacingCsd(false);
    setIsConfirmDeleteCsd(false);
  }, [client.id, client.password, client.photo, isOpen]);

  const handleSaveAll = async () => {
    setIsSaving(true);
    setPasswordError('');
    try {
      const isPasswordChanged = editedPassword !== client.password;
      // Si no se seleccionó ningún archivo nuevo y la contraseña no cambió, simplemente cerrar
      if (!selectedCerFile && !selectedKeyFile && !isPasswordChanged) {
        setIsOpen(false);
        return;
      }

      const formData = new FormData();
      if (selectedCerFile) formData.append('cerFile', selectedCerFile);
      if (selectedKeyFile) formData.append('keyFile', selectedKeyFile);
      formData.append('password', editedPassword || '');

      const res = await authFetch(`/api/clients/${client.id}/credentials`, {
        method: 'PUT',
        body: formData
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al validar y guardar los cambios');
      }

      showToast(data.message || 'Cambios de e.firma guardados y validados con éxito.', 'success');
      setSelectedCerFile(null);
      setSelectedKeyFile(null);
      setIsOpen(false);
      if (onUpdate) onUpdate(); // Refrescar clientes sin mostrar "Cliente eliminado"
    } catch (err) {
      setPasswordError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveCsd = async (e) => {
    if (e) e.preventDefault();
    if (!csdCerFile || !csdKeyFile) {
      setCsdError('Por favor selecciona tanto el archivo .cer como el archivo .key del CSD.');
      return;
    }
    if (!csdPassword) {
      setCsdError('Por favor ingresa la contraseña de la llave privada del CSD.');
      return;
    }

    setIsSavingCsd(true);
    setCsdError('');
    try {
      const formData = new FormData();
      formData.append('cerFile', csdCerFile);
      formData.append('keyFile', csdKeyFile);
      formData.append('password', csdPassword);

      const res = await authFetch(`/api/clients/${client.id}/csd`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al guardar el CSD');
      }

      showToast(data.message || 'Certificado de Sello Digital guardado con éxito', 'success');
      setCsdCerFile(null);
      setCsdKeyFile(null);
      setCsdPassword('');
      setIsReplacingCsd(false);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error(err);
      setCsdError(err.message);
      showToast(err.message, 'error');
    } finally {
      setIsSavingCsd(false);
    }
  };

  const handleDeleteCsd = async () => {
    if (!currentCsd) return;
    setIsDeletingCsd(true);
    try {
      const res = await authFetch(`/api/clients/${client.id}/csd/${currentCsd.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar el CSD');

      setIsConfirmDeleteCsd(false);
      showToast('Certificado de Sello Digital (CSD) desvinculado con éxito', 'success');
      if (onUpdate) onUpdate();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setIsDeletingCsd(false);
    }
  };

  const handleDownloadCsd = async () => {
    if (!currentCsd) return;
    showToast('Preparando descarga de archivos de Sello Digital (CSD)...', 'info');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/clients/${client.id}/csd/${currentCsd.id}/download${token ? `?token=${token}` : ''}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) throw new Error('Error al descargar CSD');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CSD_${client.rfc}_${currentCsd.branchName || 'UNICA'}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Descarga de Sello Digital (CSD) completada con éxito', 'success');
    } catch (err) {
      showToast('Error al descargar los archivos del CSD', 'error');
    }
  };

  const handleCopyCsdPassword = async () => {
    if (!currentCsd) return;
    try {
      const res = await authFetch(`/api/clients/${client.id}/csd/${currentCsd.id}/reveal-password`, {
        method: 'POST'
      });
      const data = await res.json();
      if (data.success && data.password) {
        await navigator.clipboard.writeText(data.password);
        showToast('Contraseña de CSD copiada (Acceso auditado)', 'success');
      } else {
        showToast(data.error || 'No se pudo obtener la contraseña del CSD', 'error');
      }
    } catch (err) {
      showToast('Error al obtener la contraseña del CSD', 'error');
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setDeleteError('');
    try {
      const res = await authFetch(`/api/clients/${client.id}`, {
        method: 'DELETE',
        body: JSON.stringify({ adminPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al eliminar');
      }
      onDelete();
    } catch (err) {
      console.error(err);
      setDeleteError(err.message);
    } finally {
      setIsDeleting(false);
      if (!deleteError) {
        setIsOpen(false);
        setIsConfirmOpen(false);
        setAdminPassword('');
      }
    }
  };

  const cancelDelete = () => {
    setIsConfirmOpen(false);
    setAdminPassword('');
    setDeleteError('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        title="Ajustes"
        className="inline-flex items-center justify-center w-8 h-8 rounded border bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 border-slate-200 hover:border-slate-300 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-slate-200 cursor-pointer"
      >
        <span className="material-symbols-outlined text-[18px]">settings</span>
      </button>

      {isOpen && !isConfirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-sm text-left whitespace-normal">
          <div className="w-full max-w-[780px] max-h-[95vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150 whitespace-normal border border-slate-200/90">
            {/* Header */}
            <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-slate-50/50">
              <div className="flex items-center gap-2.5 min-w-0">
                <h2 className="text-sm font-bold text-slate-900 shrink-0">Ajustes de Contribuyente</h2>
                <span className="px-2 py-0.5 rounded text-[10.5px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                  {client.rfc}
                </span>
                {client.name && (
                  <span className="text-xs text-slate-500 font-medium truncate max-w-[380px]" title={client.name}>
                    • {client.name}
                  </span>
                )}
              </div>
              <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Content Body */}
            <div className="p-5 flex flex-col gap-3.5 overflow-y-auto">
              {/* Profile & General Data Combined Card */}
              <div className="flex items-center gap-4 bg-slate-50/90 p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                {/* Photo / Avatar */}
                <div className="relative group shrink-0" title="Clic para subir o cambiar fotografía">
                  <div className="w-14 h-14 rounded-2xl border-2 border-slate-200/90 bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 flex items-center justify-center overflow-hidden shadow-xs group-hover:border-indigo-400 transition-all cursor-pointer">
                    {photoSrc ? (
                      <img src={photoSrc} alt="Profile" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-700 select-none">
                        <span className="font-bold text-sm tracking-wider font-mono">{clientInitials}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-2xl">
                      <span className="material-symbols-outlined text-white text-[18px]">photo_camera</span>
                    </div>
                    <input type="file" accept="image/*" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs border-2 border-white pointer-events-none group-hover:bg-indigo-600 transition-colors">
                    <span className="material-symbols-outlined text-[10px]">edit</span>
                  </div>
                </div>

                {/* Datos Generales en Grid de 4 columnas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">CURP</span>
                    <span className="text-[11.5px] font-mono text-slate-800 font-medium select-all truncate" title={client.curp}>
                      {client.curp || (client.rfc && client.rfc.length === 12 ? 'Persona Moral' : 'N/D')}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">Correo</span>
                    <span className="text-[11.5px] text-slate-800 font-medium select-all break-all leading-tight" title={client.email}>
                      {client.email || 'N/D'}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">No. Serie</span>
                    <span className="text-[11px] font-mono text-slate-800 font-medium select-all truncate" title={client.certSerialNumber}>
                      {client.certSerialNumber || 'N/D'}
                    </span>
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[9.5px] text-slate-400 font-bold uppercase tracking-wider">Emisor</span>
                    <span className="text-[11px] font-semibold text-slate-700 truncate" title={client.issuer || 'SAT'}>
                      SAT (México)
                    </span>
                  </div>
                </div>
              </div>

              {/* Selector de Pestañas: e.firma vs CSD */}
              <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('fiel')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'fiel' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">verified_user</span>
                  e.firma (FIEL)
                  <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Principal
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('csd')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'csd' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <span className="material-symbols-outlined text-[16px] text-amber-600">vpn_key</span>
                  Sello Digital (CSD)
                  {currentCsd ? (
                    <span className="px-1.5 py-0.2 rounded text-[8.5px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                      Activo
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.2 rounded text-[8.5px] font-medium bg-slate-200 text-slate-600">
                      Opcional
                    </span>
                  )}
                </button>
              </div>

              {/* Pestaña 1: e.firma (FIEL) */}
              {activeTab === 'fiel' && (
                <div className="flex flex-col gap-3.5 animate-in fade-in duration-150">
                  {/* Grid 2 Columnas: Certificado y Llave Privada */}
                  <div className="grid grid-cols-2 gap-3.5">
                    {/* Certificado .cer */}
                    <div>
                      <div className="flex justify-between items-center mb-1 min-h-[18px]">
                        <span className="text-[10.5px] font-semibold text-slate-700">Certificado e.firma (.cer)</span>
                        {selectedCerFile && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-in fade-in duration-150">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            Vigente
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${selectedCerFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${selectedCerFile ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-emerald-600 border-slate-200 shadow-2xs'}`}>
                            <span className="material-symbols-outlined text-[18px]">verified_user</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[11.5px] font-mono font-medium text-slate-900 truncate" title={selectedCerFile ? selectedCerFile.name : `${client.rfc.toLowerCase()}.cer`}>
                              {selectedCerFile ? selectedCerFile.name : `${client.rfc.toLowerCase()}.cer`}
                            </span>
                            <span className={`text-[10px] truncate ${selectedCerFile ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                              {selectedCerFile ? 'Nuevo archivo cargado' : `Vence: ${formatDate(client.validTo)}`}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {selectedCerFile && (
                            <button
                              type="button"
                              onClick={() => setSelectedCerFile(null)}
                              className="px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold transition-colors cursor-pointer border border-rose-200"
                              title="Descartar archivo seleccionado"
                            >
                              Quitar
                            </button>
                          )}
                          <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-xs text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">sync</span>
                            {selectedCerFile ? 'Cambiar' : 'Elegir'}
                            <input
                              type="file"
                              accept=".cer"
                              className="hidden"
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  setSelectedCerFile(e.target.files[0]);
                                  setPasswordError('');
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* Llave Privada .key */}
                    <div>
                      <div className="flex justify-between items-center mb-1 min-h-[18px]">
                        <span className="text-[10.5px] font-semibold text-slate-700">Llave Privada (.key)</span>
                        {selectedKeyFile && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 animate-in fade-in duration-150">
                            <span className="material-symbols-outlined text-[13px]">check_circle</span>
                            Cargada
                          </span>
                        )}
                      </div>
                      <div className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${selectedKeyFile ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'}`}>
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 ${selectedKeyFile ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-white text-emerald-600 border-slate-200 shadow-2xs'}`}>
                            <span className="material-symbols-outlined text-[18px]">key</span>
                          </div>
                          <div className="flex flex-col min-w-0">
                            <span className="text-[11.5px] font-mono font-medium text-slate-900 truncate" title={selectedKeyFile ? selectedKeyFile.name : `${client.rfc.toLowerCase()}.key`}>
                              {selectedKeyFile ? selectedKeyFile.name : `${client.rfc.toLowerCase()}.key`}
                            </span>
                            <span className={`text-[10px] truncate ${selectedKeyFile ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                              {selectedKeyFile ? 'Nuevo archivo cargado' : 'PKCS#8 Custodiada'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {selectedKeyFile && (
                            <button
                              type="button"
                              onClick={() => setSelectedKeyFile(null)}
                              className="px-2 py-1 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-bold transition-colors cursor-pointer border border-rose-200"
                              title="Descartar archivo seleccionado"
                            >
                              Quitar
                            </button>
                          )}
                          <label className="cursor-pointer px-2.5 py-1 rounded-lg bg-white border border-slate-200 shadow-xs text-[10.5px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-[13px]">sync</span>
                            {selectedKeyFile ? 'Cambiar' : 'Elegir'}
                            <input
                              type="file"
                              accept=".key"
                              className="hidden"
                              onChange={e => {
                                if (e.target.files && e.target.files[0]) {
                                  setSelectedKeyFile(e.target.files[0]);
                                  setPasswordError('');
                                }
                                e.target.value = '';
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Contraseña e.firma */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10.5px] font-semibold text-slate-700">Contraseña de la e.firma</span>
                      <span className="text-[9.5px] font-mono text-slate-400">AES-256</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={editedPassword}
                        onChange={(e) => {
                          setEditedPassword(e.target.value);
                          setPasswordError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isSaving) {
                            handleSaveAll();
                          }
                        }}
                        className={`w-full pl-3 pr-9 py-2 bg-white border rounded-lg text-slate-900 text-[12.5px] tracking-widest font-mono focus:outline-none focus:ring-1 transition-all ${passwordError ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/30' : 'border-slate-200 focus:ring-slate-300'}`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[17px]">{showPassword ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                    {passwordError && (
                      <div className="mt-1.5 p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-start gap-2 shadow-xs">
                        <span className="material-symbols-outlined text-rose-500 text-[16px] shrink-0 mt-0.5">error</span>
                        <div className="min-w-0 flex-1 leading-snug font-medium">
                          {passwordError}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pestaña 2: Sello Digital (CSD) */}
              {activeTab === 'csd' && (
                <div className="flex flex-col gap-3 animate-in fade-in duration-150">
                  {currentCsd && !isReplacingCsd ? (
                    <div className="flex flex-col gap-3">
                      {/* Sucursal y acciones rápidas */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-50/90 border border-amber-200/80">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[17px]">store</span>
                          </div>
                          <div className="min-w-0">
                            <span className="text-[9px] text-amber-800 font-bold uppercase tracking-wider block">Sucursal</span>
                            <span className="text-[12px] font-bold text-slate-900 truncate block">{currentCsd.branchName || 'Única'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={handleDownloadCsd}
                            className="px-2.5 py-1 rounded-lg bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[10.5px] font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                            title="Descargar solo los archivos del CSD (.zip)"
                          >
                            <span className="material-symbols-outlined text-[14px]">download</span>
                            Descargar CSD
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsConfirmDeleteCsd(true)}
                            disabled={isDeletingCsd}
                            className="p-1 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Desvincular este Sello Digital"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Confirmación inline para desvincular CSD */}
                      {isConfirmDeleteCsd && (
                        <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200/90 flex flex-col gap-2 animate-in fade-in duration-150 shadow-xs">
                          <div className="flex items-start gap-2">
                            <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0 mt-0.5">warning</span>
                            <div className="min-w-0 flex-1">
                              <span className="text-[11.5px] font-bold text-rose-950 block">¿Desvincular Sello Digital (CSD)?</span>
                              <p className="text-[10.5px] text-rose-800 leading-snug mt-0.5">
                                Se removerán los certificados de sellos ({currentCsd.branchName ? `Sucursal: ${currentCsd.branchName}` : 'Única'}). La e.firma principal permanecerá segura.
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2 pt-1 border-t border-rose-200/60">
                            <button
                              type="button"
                              onClick={() => setIsConfirmDeleteCsd(false)}
                              className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold text-slate-600 hover:bg-rose-100/60 transition-colors cursor-pointer"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={handleDeleteCsd}
                              disabled={isDeletingCsd}
                              className="px-3 py-1 rounded-lg bg-rose-600 text-white text-[10.5px] font-bold hover:bg-rose-700 transition-colors inline-flex items-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[13px]">{isDeletingCsd ? 'hourglass_empty' : 'delete'}</span>
                              {isDeletingCsd ? 'Eliminando...' : 'Confirmar'}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Grid 2 Columnas: Certificado CSD y Llave Privada CSD */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Certificado CSD */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10.5px] font-semibold text-slate-700">Certificado CSD (.cer)</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                              <span className="material-symbols-outlined text-[12px]">check_circle</span>
                              Vigente
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/60">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                                <span className="material-symbols-outlined text-[16px]">verified_user</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[11.5px] font-mono font-medium text-slate-800 truncate max-w-[130px]">
                                  {`csd_${client.rfc.toLowerCase()}.cer`}
                                </span>
                                <span className="text-[9.5px] text-slate-500 truncate max-w-[130px]">
                                  {`Vence: ${formatDate(currentCsd.validTo)}`}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsReplacingCsd(true)}
                              className="px-2 py-1 rounded bg-white border border-slate-200 shadow-xs text-[10.5px] font-medium text-slate-700 hover:bg-slate-50 transition-colors inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              <span className="material-symbols-outlined text-[13px]">sync</span>
                              Cambiar
                            </button>
                          </div>
                        </div>

                        {/* Llave Privada CSD */}
                        <div>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10.5px] font-semibold text-slate-700">Llave Privada CSD (.key)</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-600">
                              <span className="material-symbols-outlined text-[12px]">check_circle</span>
                              Cargada
                            </span>
                          </div>
                          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-slate-50/60">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100 shrink-0">
                                <span className="material-symbols-outlined text-[16px]">key</span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                <span className="text-[11.5px] font-mono font-medium text-slate-800 truncate max-w-[130px]">
                                  {`csd_${client.rfc.toLowerCase()}.key`}
                                </span>
                                <span className="text-[9.5px] text-slate-500">PKCS#8</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">
                              Listo CFDI
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Contraseña CSD */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10.5px] font-semibold text-slate-700">Contraseña de Sellos Digitales</span>
                          <span className="text-[9.5px] font-mono text-slate-400">AES-256</span>
                        </div>
                        <div className="relative">
                          <input
                            type={showCsdPassword ? "text" : "password"}
                            readOnly
                            value={currentCsd.password || ''}
                            className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 text-[12.5px] tracking-widest font-mono select-all focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCsdPassword(!showCsdPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[17px]">{showCsdPassword ? 'visibility_off' : 'visibility'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Formulario de Carga / Reemplazo de CSD */
                    <form onSubmit={handleSaveCsd} className="flex flex-col gap-3">
                      <div className="px-3 py-1.5 rounded-lg bg-amber-50/80 border border-amber-200/80 flex items-center justify-between gap-2 text-[11px] text-slate-700">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-600 text-[16px] shrink-0">vpn_key</span>
                          <span>
                            <strong>{isReplacingCsd ? 'Reemplazar Sello CSD' : 'Cargar Sello CSD'}:</strong> Archivos para facturación y timbrado CFDI con PACs.
                          </span>
                        </div>
                        {isReplacingCsd && (
                          <button
                            type="button"
                            onClick={() => {
                              setIsReplacingCsd(false);
                              setCsdCerFile(null);
                              setCsdKeyFile(null);
                              setCsdPassword('');
                              setCsdError('');
                            }}
                            className="text-[10.5px] font-semibold text-slate-500 hover:text-slate-800 shrink-0 underline cursor-pointer"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>

                      {/* Grid 2 Columnas para carga de .cer y .key */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Input .cer CSD */}
                        <div>
                          <span className="text-[10.5px] font-semibold text-slate-700 block mb-1">Certificado CSD (.cer)</span>
                          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="material-symbols-outlined text-amber-600 text-[16px] shrink-0">verified_user</span>
                              <span className={`text-[11px] font-mono truncate max-w-[125px] ${csdCerFile ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                                {csdCerFile ? csdCerFile.name : 'Ningún .cer'}
                              </span>
                            </div>
                            <label className="cursor-pointer px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-700 transition-colors shrink-0">
                              {csdCerFile ? 'Cambiar' : 'Elegir'}
                              <input
                                type="file"
                                accept=".cer"
                                className="hidden"
                                onChange={e => {
                                  if (e.target.files && e.target.files[0]) {
                                    setCsdCerFile(e.target.files[0]);
                                    setCsdError('');
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>

                        {/* Input .key CSD */}
                        <div>
                          <span className="text-[10.5px] font-semibold text-slate-700 block mb-1">Llave Privada CSD (.key)</span>
                          <div className="flex items-center justify-between p-2 rounded-lg border border-slate-200 bg-white">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="material-symbols-outlined text-amber-600 text-[16px] shrink-0">key</span>
                              <span className={`text-[11px] font-mono truncate max-w-[125px] ${csdKeyFile ? 'text-slate-900 font-semibold' : 'text-slate-400'}`}>
                                {csdKeyFile ? csdKeyFile.name : 'Ningún .key'}
                              </span>
                            </div>
                            <label className="cursor-pointer px-2 py-1 rounded bg-slate-50 hover:bg-slate-100 border border-slate-200 text-[10.5px] font-semibold text-slate-700 transition-colors shrink-0">
                              {csdKeyFile ? 'Cambiar' : 'Elegir'}
                              <input
                                type="file"
                                accept=".key"
                                className="hidden"
                                onChange={e => {
                                  if (e.target.files && e.target.files[0]) {
                                    setCsdKeyFile(e.target.files[0]);
                                    setCsdError('');
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Fila Contraseña CSD y Botón Guardar */}
                      <div className="flex items-end gap-2.5">
                        <div className="flex-1">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10.5px] font-semibold text-slate-700">Contraseña de la Llave del CSD</span>
                            <span className="text-[9.5px] font-mono text-slate-400">AES-256</span>
                          </div>
                          <div className="relative">
                            <input
                              type={showCsdPassword ? "text" : "password"}
                              placeholder="Ingresa la contraseña del sello"
                              value={csdPassword}
                              onChange={e => {
                                setCsdPassword(e.target.value);
                                setCsdError('');
                              }}
                              className={`w-full pl-3 pr-8 py-2 bg-white border rounded-lg text-slate-900 text-xs font-mono focus:outline-none focus:ring-1 transition-all ${csdError ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/20' : 'border-slate-200 focus:ring-amber-500'}`}
                            />
                            <button
                              type="button"
                              onClick={() => setShowCsdPassword(!showCsdPassword)}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-[16px]">{showCsdPassword ? 'visibility_off' : 'visibility'}</span>
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isSavingCsd}
                          className="px-4 py-2 rounded-lg bg-amber-600 text-white text-[11.5px] font-bold hover:bg-amber-700 transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                        >
                          <span className="material-symbols-outlined text-[15px]">{isSavingCsd ? 'hourglass_empty' : 'save'}</span>
                          {isSavingCsd ? 'Guardando...' : 'Guardar Sello CSD'}
                        </button>
                      </div>

                      {csdError && (
                        <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-start gap-2 shadow-xs animate-in fade-in duration-150">
                          <span className="material-symbols-outlined text-rose-500 text-[16px] shrink-0 mt-0.5">error</span>
                          <div className="min-w-0 flex-1 leading-snug font-medium">
                            {csdError}
                          </div>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between shrink-0">
              <button
                onClick={() => setIsConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-600 hover:text-rose-700 transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                Eliminar cliente
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
                {activeTab === 'fiel' && (
                  <button
                    onClick={handleSaveAll}
                    disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[15px]">{isSaving ? 'hourglass_empty' : 'check'}</span>
                    {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Deletion Modal */}
      {isConfirmOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm text-left whitespace-normal">
          <div className="w-full max-w-[400px] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-slate-200/50 whitespace-normal">
            <div className="p-6 pb-4">
              <div className="w-12 h-12 rounded-full bg-rose-50 flex items-center justify-center mb-4 border border-rose-100">
                <span className="material-symbols-outlined text-[24px] text-rose-600">warning</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-1">Eliminar Contribuyente</h3>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                Estás a punto de eliminar a <span className="font-semibold text-slate-700">{client.name}</span>. Esta acción no se puede deshacer y borrará permanentemente sus credenciales de e.firma{client.hasCsd || (client.csdCertificates && client.csdCertificates.length > 0) ? ' y Sellos Digitales (CSD)' : ''}.
              </p>

              <div className="mb-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Escribe la contraseña de administrador para confirmar:</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && adminPassword && !isDeleting) {
                      handleDelete();
                    }
                  }}
                  className={`w-full px-3 py-2 bg-slate-50 border rounded-lg text-slate-900 text-sm focus:outline-none focus:ring-2 focus:bg-white transition-all ${deleteError ? 'border-rose-300 focus:ring-rose-200' : 'border-slate-200 focus:ring-slate-200'}`}
                  placeholder="Contraseña de administrador"
                  autoFocus
                />
                {deleteError && <p className="text-[11px] text-rose-600 font-medium mt-1.5">{deleteError}</p>}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={cancelDelete}
                className="px-4 py-2 rounded-lg text-[12px] font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting || !adminPassword}
                className="px-4 py-2 rounded-lg bg-rose-600 text-white text-[12px] font-semibold hover:bg-rose-700 disabled:opacity-50 disabled:hover:bg-rose-600 transition-colors inline-flex items-center gap-1.5 shadow-sm"
              >
                <span className="material-symbols-outlined text-[16px]">{isDeleting ? 'hourglass_empty' : 'delete_forever'}</span>
                {isDeleting ? 'Eliminando...' : 'Eliminar Permanentemente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Cropper Modal */}
      {cropImageSrc && (
        <ImageCropperModal
          imageSrc={cropImageSrc}
          onCropComplete={onCropComplete}
          onCancel={() => setCropImageSrc(null)}
        />
      )}
    </>
  );
}

function calculateStatus(validTo) {
  if (!validTo) return { status: 'critico', text: 'Sin fecha', color: 'rose', days: 0 };
  const expiry = new Date(validTo);
  if (isNaN(expiry.getTime())) return { status: 'critico', text: 'Fecha inválida', color: 'rose', days: 0 };

  const now = new Date();
  const diffTime = expiry - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return { status: 'caducado', text: 'Vencido', color: 'rose', days: diffDays };
  if (diffDays <= 30) return { status: 'critico', text: `${diffDays} días`, color: 'rose', days: diffDays };
  if (diffDays <= 60) return { status: 'proximo', text: `${diffDays} días`, color: 'amber', days: diffDays };
  return { status: 'vigente', text: `${diffDays} días`, color: 'emerald', days: diffDays };
}

function formatDate(dateString) {
  const d = new Date(dateString);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ============================================================
// Main App (Dashboard)
// ============================================================
function Dashboard({ onLogout, onOpenPortal }) {
  const [clients, setClients] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [cerFile, setCerFile] = useState(null);
  const [keyFile, setKeyFile] = useState(null);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [toast, setToast] = useState({ open: false, message: '', type: 'success' });

  // Dashboard & Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('Todos'); // 'Todos', 'Morales', 'Fisicas'
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const searchInputRef = useRef(null);

  // Atajo global de teclado (Ctrl+K o Cmd+K) para búsqueda instantánea de clientes
  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const [isBackingUp, setIsBackingUp] = useState(false);

  const fetchClients = () => {
    authFetch('/api/clients')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setClients(data);
      })
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchClients();
    // Auto-actualización en tiempo real y al volver a la pestaña
    const interval = setInterval(fetchClients, 15000);
    const onFocus = () => fetchClients();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  // Al cambiar búsqueda o filtro de tipo, volver a la página 1
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter]);

  const showToast = (message, type = 'success') => {
    setToast({ open: true, message, type });
    setTimeout(() => setToast({ open: false, message: '', type: 'success' }), 3000);
  };

  const resetClientModal = () => {
    setCerFile(null);
    setKeyFile(null);
    setPassword('');
    setShowPassword(false);
    setSubmitError('');
    setIsSubmitting(false);
  };

  const handleOpenModal = () => {
    resetClientModal();
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    resetClientModal();
  };

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmitting) return;
    if (!cerFile || !keyFile || !password) {
      setSubmitError('Todos los campos son requeridos');
      return;
    }
    setSubmitError('');
    setIsSubmitting(true);

    const formData = new FormData();
    formData.append('cerFile', cerFile);
    formData.append('keyFile', keyFile);
    formData.append('password', password);

    try {
      const res = await authFetch('/api/clients', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Error al validar e.firma');
      }

      showToast(data.message || 'Cliente guardado y validado con éxito');
      handleCloseModal();
      fetchClients();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // KPI Calculations
  const handleBackup = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      const res = await authFetch('/api/clients/backup');
      if (!res.ok) throw new Error('Error al generar respaldo');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Credenciales.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);

      showToast('Respaldo generado con éxito');
    } catch (err) {
      console.error(err);
      showToast('Error al generar respaldo', 'error');
    } finally {
      setIsBackingUp(false);
    }
  };

  const kpiData = {
    optima: 0,
    proximas: 0,
    critica: 0,
    total: clients.length,
    morales: 0,
    fisicas: 0,
    conCsd: 0
  };

  clients.forEach(client => {
    const status = calculateStatus(client.validTo);
    if (status.status === 'vigente') kpiData.optima++;
    else if (status.status === 'proximo') kpiData.proximas++;
    else kpiData.critica++;

    if (client.rfc.length === 12) kpiData.morales++;
    else kpiData.fisicas++;

    if (client.hasCsd || (client.csdCertificates && client.csdCertificates.length > 0)) {
      kpiData.conCsd++;
    }
  });

  const getPercentage = (val) => kpiData.total === 0 ? 0 : Math.round((val / kpiData.total) * 100);

  // Filtering & Sorting (Alfabético A-Z)
  const filteredClients = clients
    .filter(client => {
      const matchesSearch = client.rfc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (client.email && client.email.toLowerCase().includes(searchQuery.toLowerCase()));

      let matchesType = true;
      if (typeFilter === 'Morales') matchesType = client.rfc.length === 12;
      if (typeFilter === 'Fisicas') matchesType = client.rfc.length === 13;

      return matchesSearch && matchesType;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

  // Pagination
  const totalPages = Math.ceil(filteredClients.length / itemsPerPage) || 1;
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const paginatedClients = filteredClients.slice((safeCurrentPage - 1) * itemsPerPage, safeCurrentPage * itemsPerPage);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.03),0_4px_16px_-4px_rgba(0,0,0,0.02)]">
        {/* Delicate hairline accent */}
        <div className="h-[2px] w-full bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900" />

        <div className="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a className="flex items-center gap-2.5 py-1 select-none group transition-opacity hover:opacity-90" href="#">
              <div className="flex items-baseline">
                <span className="text-[19px] font-black tracking-[-0.03em] text-slate-900 font-sans">
                  Firma<span className="font-light text-slate-500">Vault</span>
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 inline-block ml-1"></span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold tracking-widest uppercase bg-slate-900 text-white shadow-xs">
                SAT
              </span>
            </a>
            <div className="hidden sm:block h-4 w-[1px] bg-slate-200" />
            <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-slate-100/80 text-slate-600 border border-slate-200/70">
              Control Fiscal
            </span>
          </div>

          <div className="flex items-center gap-3">
            <LiveClock />

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-50/90 border border-slate-200/80 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-semibold text-slate-700">Sistema en línea</span>
              <span className="w-[1px] h-3 bg-slate-200" />
              <span className="text-[10px] font-mono font-medium text-slate-400">SAT v1.0</span>
            </div>
            <button
              onClick={onLogout}
              title="Cerrar sesión"
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-[18px]">logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1560px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">Gestión de Credenciales SAT</h1>
            <p className="text-xs sm:text-sm text-slate-600 mt-1 leading-relaxed font-normal">Monitoreo de certificados e.firma, control de archivos y vigencia fiscal de contribuyentes.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenModal}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-all duration-150 active:scale-[0.98]"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>Nuevo Cliente</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></div>
                <span className="font-bold text-[11px] tracking-wider uppercase">Vigencia Óptima</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                Sin riesgo
              </span>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <span className="text-4xl font-bold text-slate-900 leading-none">{kpiData.optima}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 mb-1">{getPercentage(kpiData.optima)}% del total</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${getPercentage(kpiData.optima)}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium mt-1">
              <span>&gt; 60 días de validez oficial</span>
              <span className="text-emerald-700 font-semibold">Archivos .cer/.key OK</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200/80 p-5 shadow-sm flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-amber-600">
                <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></div>
                <span className="font-bold text-[11px] tracking-wider uppercase">Próximas a Vencer</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-100">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                Monitoreo preventivo
              </span>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <span className="text-4xl font-bold text-amber-600 leading-none">{kpiData.proximas}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 mb-1">{getPercentage(kpiData.proximas)}% en seguimiento</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${getPercentage(kpiData.proximas)}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium mt-1">
              <span>30 a 60 días restantes</span>
              <span className="text-amber-700 font-semibold">Programar renovación</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-rose-200/60 p-5 shadow-[0_4px_20px_-4px_rgba(225,29,72,0.1)] flex flex-col relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2 text-rose-600">
                <div className="w-2 h-2 rounded-full bg-rose-500 shrink-0 animate-pulse"></div>
                <span className="font-bold text-[11px] tracking-wider uppercase">Urgencia Crítica</span>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                <span className="material-symbols-outlined text-[14px]">warning</span>
                Renovación Obligatoria
              </span>
            </div>
            <div className="flex items-end gap-3 mb-4">
              <span className="text-4xl font-bold text-rose-600 leading-none">{kpiData.critica}</span>
              <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 mb-1">{getPercentage(kpiData.critica)}% riesgo operativo</span>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full mb-2 overflow-hidden">
              <div className="h-full bg-rose-500 rounded-full" style={{ width: `${getPercentage(kpiData.critica)}%` }}></div>
            </div>
            <div className="flex justify-between items-center text-[11px] text-slate-500 font-medium mt-1">
              <span>&lt; 30 días o llave faltante</span>
              <span className="text-rose-700 font-bold">Riesgo de inoperatividad fiscal</span>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm p-3 flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div className="flex flex-1 items-center gap-3 w-full">
            <div className="relative flex-1 max-w-[380px]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[18px] text-slate-400">search</span>
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por RFC, razón social o correo..."
                className="w-full pl-9 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:bg-white transition-colors"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
              />
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden sm:flex items-center">
                <kbd className="px-1.5 py-0.5 text-[9.5px] font-mono font-semibold text-slate-400 bg-slate-100 border border-slate-200/80 rounded shadow-3xs">
                  Ctrl K
                </kbd>
              </div>
            </div>
            <div className="flex items-center bg-slate-50/80 rounded-lg border border-slate-200 p-0.5 h-[36px]">
              <button
                onClick={() => {
                  setTypeFilter('Todos');
                  setCurrentPage(1);
                }}
                className={`px-4 h-full rounded-md text-[11px] font-bold cursor-pointer transition-all ${typeFilter === 'Todos' ? 'bg-slate-900 shadow-sm text-white border-slate-900 border' : 'text-slate-500 hover:text-slate-700 border-transparent border'}`}
              >
                Todos <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${typeFilter === 'Todos' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{kpiData.total}</span>
              </button>
              <button
                onClick={() => {
                  setTypeFilter('Morales');
                  setCurrentPage(1);
                }}
                className={`px-4 h-full rounded-md text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${typeFilter === 'Morales' ? 'bg-slate-900 shadow-sm text-white border-slate-900 border' : 'text-slate-500 hover:text-slate-700 border-transparent border'}`}
              >
                <span className="material-symbols-outlined text-[14px]">domain</span> Morales <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] ${typeFilter === 'Morales' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{kpiData.morales}</span>
              </button>
              <button
                onClick={() => {
                  setTypeFilter('Fisicas');
                  setCurrentPage(1);
                }}
                className={`px-4 h-full rounded-md text-[11px] font-bold flex items-center gap-1.5 cursor-pointer transition-all ${typeFilter === 'Fisicas' ? 'bg-slate-900 shadow-sm text-white border-slate-900 border' : 'text-slate-500 hover:text-slate-700 border-transparent border'}`}
              >
                <span className="material-symbols-outlined text-[14px]">person</span> Físicas <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] ${typeFilter === 'Fisicas' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>{kpiData.fisicas}</span>
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Conteo de clientes en tiempo real */}
            <div className="hidden sm:flex items-center gap-2 px-3 h-[36px] bg-slate-50/80 border border-slate-200/80 rounded-lg text-xs shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-900"></span>
              </span>
              <span className="text-slate-500 font-medium">Contribuyentes:</span>
              <span className="font-bold text-slate-900 font-mono text-[13px]">{clients.length}</span>
              {searchQuery && (
                <span className="text-[10px] text-indigo-600 font-semibold bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                  {filteredClients.length} visibles
                </span>
              )}
            </div>

            <button
              onClick={handleBackup}
              disabled={isBackingUp}
              className="h-[36px] px-3 border border-slate-200 bg-white rounded-lg flex items-center gap-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {isBackingUp ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">folder_zip</span>
              )}
              {isBackingUp ? 'Respaldando...' : 'Copia de Seguridad'}
            </button>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-white text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-4 px-6 min-w-[280px]">Contribuyente</th>
                  <th className="py-4 px-4 text-center min-w-[150px]">RFC</th>
                  <th className="py-4 px-4 text-center min-w-[280px]">Credenciales</th>
                  <th className="py-4 px-4 text-center whitespace-nowrap min-w-[150px]">Vigencia & Restante</th>
                  <th className="py-4 px-6 text-center whitespace-nowrap min-w-[160px]">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal text-slate-700">
                {paginatedClients.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-600 text-sm font-medium">No se encontraron clientes con esos filtros.</td>
                  </tr>
                ) : (
                  paginatedClients.map(client => {
                    const status = calculateStatus(client.validTo);
                    const isMoral = client.rfc.length === 12;
                    const initials = client.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

                    return (
                      <tr key={client.id} className="hover:bg-slate-50/70 transition-colors group bg-white">
                        <td
                          className="py-5 px-6 cursor-pointer select-none"
                          onClick={() => onOpenPortal(client)}
                          title={`Abrir portal de operaciones de ${client.name}`}
                        >
                          <div className="flex items-center gap-4">
                            {client.photo ? (
                              <img src={client.photo} alt={client.name} className="w-11 h-11 rounded-full object-cover border border-slate-200 shadow-sm shrink-0 group-hover:ring-2 group-hover:ring-indigo-500/30 transition-all" />
                            ) : (
                              <div className={`w-11 h-11 rounded-full font-bold text-sm flex items-center justify-center shrink-0 shadow-sm border transition-all ${isMoral ? 'bg-slate-50 text-slate-600 border-slate-200 group-hover:border-slate-300' : 'bg-blue-50 text-blue-600 border-blue-100 group-hover:border-blue-200'}`}>
                                {initials}
                              </div>
                            )}
                            <div className="flex flex-col gap-1.5 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 text-[13px] tracking-tight leading-none truncate max-w-[280px] group-hover:text-indigo-600 transition-colors" title={client.name}>{client.name}</span>
                                <span className="opacity-0 group-hover:opacity-100 transition-all inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md border border-indigo-200/70 shrink-0">
                                  Abrir &rarr;
                                </span>
                              </div>

                              {client.email && (
                                <div
                                  className="flex items-center gap-1.5 text-[11px] text-slate-600 mt-0.5 group/copy w-fit max-w-full"
                                  title={client.email}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="material-symbols-outlined text-[14px] text-slate-500 shrink-0">mail</span>
                                  <span className="truncate max-w-[190px] sm:max-w-[260px] font-medium text-slate-600 group-hover/copy:text-slate-900 transition-colors">{client.email}</span>
                                  <InlineCopyButton text={client.email} label="Correo" showToast={showToast} />
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-5 px-4 text-center">
                          <div
                            className="flex items-center justify-center mx-auto gap-1.5 text-[12px] font-mono font-bold text-slate-700 group/copy w-fit"
                            title="RFC"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {client.rfc}
                            <InlineCopyButton text={client.rfc} label="RFC" showToast={showToast} />
                          </div>
                          {Boolean(client.hasCsd || (client.csdCertificates && client.csdCertificates.length > 0)) && (
                            <div className="flex items-center justify-center mt-1" onClick={(e) => e.stopPropagation()}>
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-xs" title={`Certificado de Sello Digital activo (Sucursal: ${client.csdCertificates?.[0]?.branchName || 'Única'})`}>
                                <span className="material-symbols-outlined text-[10px] text-amber-600">vpn_key</span>
                                CSD {client.csdCertificates?.[0]?.branchName ? `· ${client.csdCertificates[0].branchName}` : ''}
                              </span>
                            </div>
                          )}
                        </td>
                        <td className="py-5 px-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="inline-flex items-center justify-center gap-1.5 w-[84px] h-7 rounded-md text-[11px] font-mono font-bold bg-emerald-50 text-emerald-600 border border-emerald-100" title=".cer subido">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>.cer
                            </span>
                            <span className="inline-flex items-center justify-center gap-1.5 w-[84px] h-7 rounded-md text-[11px] font-mono font-bold bg-emerald-50 text-emerald-600 border border-emerald-100" title=".key subido">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></span>.key
                            </span>
                            <CopyButton client={client} showToast={showToast} />
                          </div>
                        </td>
                        <td
                          className="py-5 px-4 text-center cursor-pointer select-none"
                          onClick={() => onOpenPortal(client)}
                          title={`Abrir portal de operaciones de ${client.name}`}
                        >
                          <div className="flex flex-col items-center justify-center gap-1.5">
                            <span className="font-bold text-slate-800 text-[12px] font-mono whitespace-nowrap">{formatDate(client.validTo).replace('.', '')}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${status.status === 'caducado' || status.status === 'critico'
                              ? 'bg-rose-50 text-rose-600 border border-rose-100'
                              : status.status === 'proximo'
                                ? 'bg-amber-50 text-amber-600 border border-amber-100'
                                : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                              }`}>
                              {status.days > 0 ? `${status.days} días restantes` : status.text}
                            </span>
                          </div>
                        </td>
                        <td className="py-5 px-6 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-2">
                            <AjustesButton
                              client={client}
                              showToast={showToast}
                              onUpdate={() => {
                                fetchClients();
                              }}
                              onDelete={() => {
                                fetchClients();
                                showToast('Cliente eliminado correctamente', 'success');
                              }}
                            />

                            <DescargaButton
                              id={client.id}
                              rfc={client.rfc}
                              hasCsd={Boolean(client.hasCsd || (client.csdCertificates && client.csdCertificates.length > 0))}
                              showToast={showToast}
                            />

                            <PortalClienteButton client={client} onOpenPortal={onOpenPortal} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-white flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>Mostrando {paginatedClients.length} de {filteredClients.length} contribuyentes</span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safeCurrentPage === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
              >
                Anterior
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 flex items-center justify-center rounded-md border transition-colors ${safeCurrentPage === page ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'}`}
                >
                  {page}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage === totalPages}
                className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Toast Notificación Top-Tier */}
      <div className={`fixed bottom-6 right-6 z-[100] transform transition-all duration-300 ease-out flex items-center gap-3 px-4 py-3 bg-slate-900/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-slate-800 text-xs max-w-md ${toast.open ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-6 opacity-0 scale-95 pointer-events-none'}`}>
        <span className={`material-symbols-outlined text-[20px] shrink-0 ${
          toast.type === 'error' ? 'text-rose-400' : toast.type === 'info' ? 'text-sky-400' : 'text-emerald-400'
        }`}>
          {toast.type === 'error' ? 'error' : toast.type === 'info' ? 'info' : 'check_circle'}
        </span>
        <span className="font-medium text-slate-100 leading-snug">{toast.message}</span>
      </div>

      {/* Modal Nuevo Cliente */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Agregar Contribuyente SAT</h2>
                <p className="text-[11px] text-slate-500">Validación y custodia criptográfica de e.firma oficial</p>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4 text-xs">
              {submitError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5 shadow-xs animate-in fade-in duration-150">
                  <span className="material-symbols-outlined text-rose-600 text-[18px] shrink-0 mt-0.5">error</span>
                  <div className="min-w-0 flex-1 leading-relaxed font-medium">
                    {submitError}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Certificado (.cer)</label>
                  <label className="border border-dashed border-slate-300 hover:border-slate-500 bg-slate-50 hover:bg-slate-100/70 rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-24 relative group">
                    <input
                      type="file"
                      accept=".cer"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setCerFile(e.target.files[0]);
                          setSubmitError('');
                        }
                        e.target.value = '';
                      }}
                    />
                    <span className="material-symbols-outlined text-[20px] text-slate-400 mb-0.5">verified_user</span>
                    <span className="font-medium text-slate-700 truncate max-w-[140px]">{cerFile ? cerFile.name : 'Subir .cer'}</span>
                    {cerFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setCerFile(null);
                        }}
                        className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-slate-200 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors"
                        title="Quitar certificado"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </label>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Llave Privada (.key)</label>
                  <label className="border border-dashed border-slate-300 hover:border-slate-500 bg-slate-50 hover:bg-slate-100/70 rounded-lg p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-colors h-24 relative group">
                    <input
                      type="file"
                      accept=".key"
                      className="hidden"
                      onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          setKeyFile(e.target.files[0]);
                          setSubmitError('');
                        }
                        e.target.value = '';
                      }}
                    />
                    <span className="material-symbols-outlined text-[20px] text-slate-400 mb-0.5">key</span>
                    <span className="font-medium text-slate-700 truncate max-w-[140px]">{keyFile ? keyFile.name : 'Subir .key'}</span>
                    {keyFile && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setKeyFile(null);
                        }}
                        className="absolute top-1.5 right-1.5 p-0.5 rounded-full bg-slate-200 hover:bg-rose-100 text-slate-500 hover:text-rose-600 transition-colors"
                        title="Quitar llave privada"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Contraseña de la Llave Privada</label>
                <div className="relative flex items-center">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => {
                      setPassword(e.target.value);
                      if (submitError) setSubmitError('');
                    }}
                    className="w-full pl-3 pr-9 py-1.5 bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                    placeholder="Contraseña de e.firma"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 text-slate-400 hover:text-slate-600 focus:outline-none p-0.5 rounded transition-colors flex items-center justify-center"
                    title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={handleCloseModal}
                className="px-3 py-1.5 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 text-white font-medium rounded-md transition-colors shadow-sm inline-flex items-center gap-2"
              >
                {isSubmitting ? 'Validando...' : 'Guardar y Validar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

// ============================================================
// Error Boundary to prevent blank screens
// ============================================================
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary atrapó un error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white border border-rose-200 rounded-2xl p-6 max-w-md w-full shadow-sm text-center">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-[24px]">error</span>
            </div>
            <h3 className="text-base font-bold text-slate-900">Error al desplegar el componente</h3>
            <p className="text-xs text-slate-500 mt-1 mb-4 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200 text-left">
              {this.state.error?.message || 'Error inesperado'}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                if (this.props.onReset) this.props.onReset();
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-all cursor-pointer"
            >
              Volver al Panel Principal
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// Root App with Auth Gate
// ============================================================
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedClient, setSelectedClient] = useState(null);

  useEffect(() => {
    // Check if existing token is valid
    const token = getToken();
    if (!token) {
      setIsCheckingAuth(false);
      return;
    }

    fetch('/api/auth/verify', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIsAuthenticated(true);
        } else {
          clearToken();
        }
      })
      .catch(() => clearToken())
      .finally(() => setIsCheckingAuth(false));
  }, []);

  const handleLogout = () => {
    clearToken();
    setIsAuthenticated(false);
    setCurrentView('dashboard');
    setSelectedClient(null);
  };

  const handleOpenPortal = (client) => {
    setSelectedClient(client);
    setCurrentView('portal');
  };

  const handleBackToDashboard = () => {
    setCurrentView('dashboard');
    setSelectedClient(null);
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <span className="material-symbols-outlined text-[24px] animate-spin">progress_activity</span>
          <span className="text-sm font-medium">Verificando sesión...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />;
  }

  if (currentView === 'portal' && selectedClient) {
    return (
      <ErrorBoundary onReset={handleBackToDashboard}>
        <ClientPortal
          client={selectedClient}
          onBack={handleBackToDashboard}
          onLogout={handleLogout}
        />
      </ErrorBoundary>
    );
  }

  return <Dashboard onLogout={handleLogout} onOpenPortal={handleOpenPortal} />;
}

export default App;
