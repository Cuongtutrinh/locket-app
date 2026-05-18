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
let currentFacing = 'environment'; // 'environment' (sau) hoặc 'user' (trước)

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
  
  try {
    const constraints = {
      video: {
        facingMode: { exact: currentFacing },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };
    
    currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    cameraPreview.srcObject = currentStream;
    await cameraPreview.play();
    
    // Thêm attribute để CSS xử lý lật video
    if (currentFacing === 'user') {
      cameraScreen.setAttribute('data-facing', 'user');
    } else {
      cameraScreen.setAttribute('data-facing', 'environment');
    }
    
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
  
  // Vẽ ảnh từ camera
  if (currentFacing === 'user') {
    // Cách 1: Lật ngang và giữ nguyên vị trí
    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(cameraPreview, 0, 0, width, height);
    ctx.restore();
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
    
  }, 'image/jpeg', 0.95);
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
  currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
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

// Service Worker (PWA)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);