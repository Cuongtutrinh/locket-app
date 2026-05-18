import { createClient } from '@supabase/supabase-js';

// Lấy config từ .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// DOM elements
const cameraBtn = document.getElementById('cameraBtn');
const uploadBtn = document.getElementById('uploadBtn');
const videoBtn = document.getElementById('videoBtn');
const fileInput = document.getElementById('fileInput');
const gallery = document.getElementById('gallery');
const cameraPreview = document.getElementById('cameraPreview');
const videoPreview = document.getElementById('videoRecorder');
const videoElement = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const closeCameraBtn = document.getElementById('closeCameraBtn');
const recorderVideo = document.getElementById('recorderVideo');
const startRecordBtn = document.getElementById('startRecordBtn');
const stopRecordBtn = document.getElementById('stopRecordBtn');
const closeVideoBtn = document.getElementById('closeVideoBtn');
const copyUrlBtn = document.getElementById('copyUrlBtn');
const urlDisplay = document.getElementById('urlDisplay');

// Hiển thị URL
urlDisplay.textContent = window.location.href;
copyUrlBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href);
  alert('✅ Đã sao chép link! Gửi cho bạn bè để cùng xem.');
});

// ========== 1. UPLOAD FILE LÊN SUPABASE STORAGE ==========
async function uploadFile(file, type) {
  try {
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `media/${fileName}`;
    
    // Upload lên Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) throw uploadError;
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    // Lưu thông tin vào Database
    const { error: dbError } = await supabase
      .from('media')
      .insert([
        {
          url: publicUrl,
          type: type,
          file_name: fileName,
          created_at: new Date()
        }
      ]);
    
    if (dbError) throw dbError;
    
    return publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    alert('❌ Upload thất bại: ' + error.message);
    return null;
  }
}

// ========== 2. LẤY DANH SÁCH MEDIA REAL-TIME ==========
async function loadMedia() {
  // Lấy dữ liệu ban đầu
  const { data, error } = await supabase
    .from('media')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Lỗi load media:', error);
    return;
  }
  
  renderGallery(data || []);
  
  // Lắng nghe thay đổi real-time
  supabase
    .channel('media_changes')
    .on('postgres_changes', 
      { event: 'INSERT', schema: 'public', table: 'media' },
      (payload) => {
        // Thêm ảnh mới vào đầu danh sách
        const currentMedia = JSON.parse(localStorage.getItem('media_cache') || '[]');
        currentMedia.unshift(payload.new);
        localStorage.setItem('media_cache', JSON.stringify(currentMedia));
        renderGallery(currentMedia);
      }
    )
    .subscribe();
}

function renderGallery(mediaList) {
  // Lưu cache
  localStorage.setItem('media_cache', JSON.stringify(mediaList));
  
  if (!mediaList.length) {
    gallery.innerHTML = '<div class="loading">📭 Chưa có ảnh/video nào. Hãy upload lên nhé!</div>';
    return;
  }
  
  gallery.innerHTML = mediaList.map(item => `
    <div class="gallery-item" onclick="window.open('${item.url}', '_blank')">
      ${item.type === 'video' 
        ? `<video src="${item.url}" controls preload="metadata"></video>` 
        : `<img src="${item.url}" alt="Shared media" loading="lazy">`
      }
    </div>
  `).join('');
}

// ========== 3. XỬ LÝ UPLOAD TỪ FILE ==========
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const type = file.type.startsWith('video/') ? 'video' : 'image';
  alert(`📤 Đang upload ${type}... Giữ nguyên chất lượng HD/4K`);
  
  await uploadFile(file, type);
  alert('✅ Upload thành công! Mọi người đã có thể xem.');
  fileInput.value = '';
});

// ========== 4. CAMERA (CHỤP ẢNH) ==========
let stream = null;

cameraBtn.addEventListener('click', async () => {
  cameraPreview.classList.remove('hidden');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 3840 }, height: { ideal: 2160 } }, audio: false });
    videoElement.srcObject = stream;
  } catch (err) {
    alert('❌ Không thể truy cập camera: ' + err.message);
    cameraPreview.classList.add('hidden');
  }
});

captureBtn.addEventListener('click', async () => {
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  canvas.getContext('2d').drawImage(videoElement, 0, 0);
  
  canvas.toBlob(async (blob) => {
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    await uploadFile(file, 'image');
    closeCamera();
  }, 'image/jpeg', 0.95);
});

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraPreview.classList.add('hidden');
}

closeCameraBtn.addEventListener('click', closeCamera);

// ========== 5. VIDEO RECORDER ==========
let mediaRecorder = null;
let recordedChunks = [];
let currentVideoStream = null;

videoBtn.addEventListener('click', async () => {
  videoPreview.classList.remove('hidden');
  try {
    currentVideoStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 3840 }, height: { ideal: 2160 } }, 
      audio: true 
    });
    recorderVideo.srcObject = currentVideoStream;
  } catch (err) {
    alert('❌ Không thể truy cập camera: ' + err.message);
    videoPreview.classList.add('hidden');
  }
});

startRecordBtn.addEventListener('click', () => {
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(currentVideoStream, { mimeType: 'video/webm' });
  
  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) recordedChunks.push(event.data);
  };
  
  mediaRecorder.onstop = async () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
    await uploadFile(file, 'video');
    closeVideoRecorder();
  };
  
  mediaRecorder.start();
  startRecordBtn.classList.add('hidden');
  stopRecordBtn.classList.remove('hidden');
});

stopRecordBtn.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
});

function closeVideoRecorder() {
  if (currentVideoStream) {
    currentVideoStream.getTracks().forEach(track => track.stop());
    currentVideoStream = null;
  }
  videoPreview.classList.add('hidden');
  startRecordBtn.classList.remove('hidden');
  stopRecordBtn.classList.add('hidden');
}

closeVideoBtn.addEventListener('click', closeVideoRecorder);

// Khởi động
loadMedia();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

window.open = window.open.bind(window);