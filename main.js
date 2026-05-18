import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const cameraBtn = document.getElementById('cameraBtn');
const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const cameraModal = document.getElementById('cameraModal');
const cameraVideo = document.getElementById('cameraVideo');
const shootBtn = document.getElementById('shootBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const switchCamBtn = document.getElementById('switchCamBtn');
const photoCanvas = document.getElementById('photoCanvas');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const urlDisplay = document.getElementById('urlDisplay');

// State
let currentStream = null;
let currentFacingMode = 'environment'; // 'environment' = cam sau, 'user' = cam trước

// Hiển thị URL
urlDisplay.textContent = window.location.href;
copyUrlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã sao chép link! Gửi cho bạn bè để cùng xem.');
});

// ========== CAMERA FUNCTIONS ==========
async function startCamera() {
  try {
    // Dừng stream cũ
    if (currentStream) {
      currentStream.getTracks().forEach(track => track.stop());
    }
    
    const constraints = {
      video: {
        facingMode: { exact: currentFacingMode },
        width: { ideal: 3840 },
        height: { ideal: 2160 }
      }
    };
    
    try {
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Fallback nếu không có 4K
      constraints.video.width = { ideal: 1920 };
      constraints.video.height = { ideal: 1080 };
      currentStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    cameraVideo.srcObject = currentStream;
    await cameraVideo.play();
    
  } catch (error) {
    console.error('Camera error:', error);
    alert('❌ Không thể mở camera: ' + error.message);
    closeCamera();
  }
}

function stopCamera() {
  if (currentStream) {
    currentStream.getTracks().forEach(track => track.stop());
    currentStream = null;
  }
  cameraVideo.srcObject = null;
}

function closeCamera() {
  stopCamera();
  cameraModal.classList.add('hidden');
}

async function switchCamera() {
  currentFacingMode = currentFacingMode === 'environment' ? 'user' : 'environment';
  await startCamera();
}

async function capturePhoto() {
  if (!cameraVideo.videoWidth || !cameraVideo.videoHeight) {
    alert('⚠️ Camera chưa sẵn sàng, vui lòng đợi 1 giây');
    return;
  }
  
  // Set canvas đúng kích thước video
  photoCanvas.width = cameraVideo.videoWidth;
  photoCanvas.height = cameraVideo.videoHeight;
  
  const context = photoCanvas.getContext('2d');
  
  // Vẽ ảnh từ video
  if (currentFacingMode === 'user') {
    // Cam trước: lật ảnh để đúng chiều
    context.save();
    context.scale(-1, 1);
    context.drawImage(cameraVideo, -photoCanvas.width, 0, photoCanvas.width, photoCanvas.height);
    context.restore();
  } else {
    context.drawImage(cameraVideo, 0, 0, photoCanvas.width, photoCanvas.height);
  }
  
  // Chuyển thành file
  photoCanvas.toBlob(async (blob) => {
    if (!blob) {
      alert('❌ Không thể chụp ảnh');
      return;
    }
    
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadFile(file, 'image');
    closeCamera();
    
  }, 'image/jpeg', 0.95);
}

// ========== UPLOAD & DATABASE ==========
async function uploadFile(file, type) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `media/${fileName}`;
    
    // Upload lên Storage
    const { error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file, { cacheControl: '3600' });
    
    if (uploadError) throw uploadError;
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    // Lưu vào Database
    const { error: dbError } = await supabase
      .from('media')
      .insert([{
        url: publicUrl,
        type: type,
        file_name: fileName,
        created_at: new Date().toISOString()
      }]);
    
    if (dbError) throw dbError;
    
    alert('✅ Upload thành công!');
    await loadMedia();
    
  } catch (error) {
    console.error('Upload error:', error);
    alert('❌ Upload thất bại: ' + error.message);
  }
}

async function loadMedia() {
  try {
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (!data || data.length === 0) {
      gallery.innerHTML = '<div class="loading">📭 Chưa có ảnh nào. Hãy upload lên nhé!</div>';
      return;
    }
    
    // Chỉ hiển thị ảnh, bỏ video
    const imagesOnly = data.filter(item => item.type === 'image');
    
    if (imagesOnly.length === 0) {
      gallery.innerHTML = '<div class="loading">📭 Chưa có ảnh nào. Hãy upload lên nhé!</div>';
      return;
    }
    
    gallery.innerHTML = imagesOnly.map(item => `
      <div class="gallery-item" onclick="window.open('${item.url}', '_blank')">
        <img src="${item.url}" alt="Shared photo" loading="lazy" style="width:100%;height:100%;object-fit:cover;">
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Load error:', error);
    gallery.innerHTML = `<div class="loading">❌ Lỗi: ${error.message}</div>`;
  }
}

// ========== REAL-TIME ==========
function setupRealtime() {
  supabase
    .channel('media_changes')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'media' },
      () => loadMedia()
    )
    .subscribe();
}

// ========== EVENT LISTENERS ==========
cameraBtn.addEventListener('click', async () => {
  cameraModal.classList.remove('hidden');
  await startCamera();
});

shootBtn.addEventListener('click', capturePhoto);
closeModalBtn.addEventListener('click', closeCamera);
switchCamBtn.addEventListener('click', switchCamera);

uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  if (!file.type.startsWith('image/')) {
    alert('⚠️ Chỉ chấp nhận file ảnh (JPEG, PNG)');
    fileInput.value = '';
    return;
  }
  
  await uploadFile(file, 'image');
  fileInput.value = '';
});

// ========== KHỞI ĐỘNG ==========
async function init() {
  console.log('🚀 Locket Clone ready!');
  await loadMedia();
  setupRealtime();
}

init();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.log);
}

window.open = window.open.bind(window);