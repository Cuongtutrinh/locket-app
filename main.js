import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const openCameraBtn = document.getElementById('openCameraBtn');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const fileUpload = document.getElementById('fileUpload');
const imageGrid = document.getElementById('imageGrid');
const cameraScreen = document.getElementById('cameraScreen');
const cameraPreview = document.getElementById('cameraPreview');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const closeCamera = document.getElementById('closeCamera');
const switchCamera = document.getElementById('switchCamera');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const copyBtn = document.getElementById('copyBtn');
const urlText = document.getElementById('urlText');

// State
let currentStream = null;
let frontCameraDevice = null;
let backCameraDevice = null;
let isUsingFrontCamera = false;

async function findCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const videoDevices = devices.filter(device => device.kind === 'videoinput');

  // Heuristics to find the main front and back cameras
  backCameraDevice = videoDevices.find(device => /back|rear|environment/i.test(device.label)) || videoDevices.find(d => !/front/i.test(d.label)) || videoDevices[0];
  frontCameraDevice = videoDevices.find(device => /front|user|selfie/i.test(device.label)) || videoDevices.find(d => d.deviceId !== backCameraDevice?.deviceId);

  // Set initial camera
  isUsingFrontCamera = false; // Default to back camera
}

// Hiển thị URL
urlText.textContent = window.location.href;
copyBtn.onclick = () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã copy link!');
};

// ========== MỞ CAMERA ==========
async function startCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
  }

  // Ensure we have identified cameras first
  if (!frontCameraDevice && !backCameraDevice) {
    await findCameras();
  }

  const targetDevice = isUsingFrontCamera ? frontCameraDevice : backCameraDevice;
  const facingMode = isUsingFrontCamera ? 'user' : 'environment';

  try {
    const constraints = {
      video: {
        deviceId: targetDevice ? { exact: targetDevice.deviceId } : undefined,
        facingMode: !targetDevice ? { ideal: facingMode } : undefined,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraPreview.srcObject = currentStream;
    cameraPreview.setAttribute('playsinline', '');
    cameraPreview.setAttribute('webkit-playsinline', '');
    cameraPreview.autoplay = true;
    cameraPreview.playsInline = true;
    cameraPreview.muted = true;
    cameraPreview.controls = false;
    cameraPreview.removeAttribute('controls');
    cameraPreview.disablePictureInPicture = true;
    cameraPreview.setAttribute('controlsList', 'nodownload noplaybackrate noremoteplayback');
    cameraPreview.style.pointerEvents = 'none';
    cameraPreview.style.touchAction = 'none';
    // Mirror the preview for the front camera
    cameraPreview.style.transform = isUsingFrontCamera ? 'scaleX(-1)' : 'none';
    await cameraPreview.play();
  } catch (err) {
    console.error('Camera error:', err);
    alert('Không thể mở camera: ' + err.message);
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  cameraPreview.srcObject = null;
}

// ========== CHỤP ẢNH ==========
async function takePhoto() {
  if (!cameraPreview.videoWidth || !cameraPreview.videoHeight) {
    alert('Camera chưa sẵn sàng');
    return;
  }
  
  const width = cameraPreview.videoWidth;
  const height = cameraPreview.videoHeight;
  
  hiddenCanvas.width = width;
  hiddenCanvas.height = height;
  
  const ctx = hiddenCanvas.getContext('2d');

  // The preview is mirrored for the front camera, but the captured image should be natural.
  // We draw the video frame to the canvas. If the preview was mirrored, we need to un-mirror it for the final image.
  if (isUsingFrontCamera) {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraPreview, 0, 0, width, height);
    // Reset transform to avoid affecting subsequent draws
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else {
    ctx.drawImage(cameraPreview, 0, 0, width, height);
  }
  
  // Chuyển thành file
  hiddenCanvas.toBlob(async (blob) => {
    if (!blob) {
      alert('Chụp ảnh thất bại');
      return;
    }
    
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadPhoto(file);
    closeCameraScreen();
    
  }, 'image/jpeg', 0.92);
}

// ========== UPLOAD ẢNH LÊN SUPABASE ==========
async function uploadPhoto(file) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `photos/${fileName}`;
    
    // Upload lên Storage
    const { error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file);
    
    if (uploadError) throw uploadError;
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    // Lưu vào database
    const { error: dbError } = await supabase
      .from('media')
      .insert([{
        url: publicUrl,
        type: 'image',
        created_at: new Date().toISOString()
      }]);
    
    if (dbError) throw dbError;
    
    alert('✅ Đã đăng ảnh!');
    loadPhotos();
    
  } catch (error) {
    console.error('Upload error:', error);
    alert('Upload thất bại: ' + error.message);
  }
}

// ========== HIỂN THỊ ẢNH ==========
async function loadPhotos() {
  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .eq('type', 'image')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      imageGrid.innerHTML = '<div class="loading">📭 Chưa có ảnh nào</div>';
      return;
    }
    
    imageGrid.innerHTML = data.map(item => `
      <img src="${item.url}" alt="photo" onclick="window.open('${item.url}', '_blank')">
    `).join('');
    
  } catch (error) {
    console.error('Load error:', error);
    imageGrid.innerHTML = '<div class="loading">Lỗi tải ảnh</div>';
  }
}

// ========== ĐÓNG/MỞ CAMERA ==========
function openCameraScreen() {
  cameraScreen.classList.remove('hidden');
  startCamera();
}

function closeCameraScreen() {
  cameraScreen.classList.add('hidden');
  stopCamera();
}

// ========== ĐỔI CAM TRƯỚC/SAU ==========
function switchCameraMode() {
  // Toggle between front and back
  isUsingFrontCamera = !isUsingFrontCamera;
  startCamera();
}

// ========== UPLOAD TỪ FILE ==========
function uploadFromFile() {
  fileUpload.click();
}

fileUpload.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('Chỉ chấp nhận file ảnh');
    return;
  }
  
  await uploadPhoto(file);
  fileUpload.value = '';
};

// ========== REAL-TIME ==========
function setupRealtime() {
  supabase
    .channel('photos')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'media' },
      () => loadPhotos()
    )
    .subscribe();
}

// ========== GÁN SỰ KIỆN ==========
openCameraBtn.onclick = openCameraScreen;
closeCamera.onclick = closeCameraScreen;
takePhotoBtn.onclick = takePhoto;
switchCamera.onclick = switchCameraMode;
uploadImageBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadPhotos();
setupRealtime();

findCameras(); // Find cameras on startup
// Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);