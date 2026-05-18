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
    
    console.log('Đang upload:', fileName, type);
    
    // Upload lên Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('locket-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });
    
    if (uploadError) {
      console.error('Upload error detail:', uploadError);
      throw uploadError;
    }
    
    console.log('Upload thành công, lấy public URL...');
    
    // Lấy public URL
    const { data: { publicUrl } } = supabase.storage
      .from('locket-media')
      .getPublicUrl(filePath);
    
    console.log('Public URL:', publicUrl);
    
    // Lưu thông tin vào Database
    const { error: dbError } = await supabase
      .from('media')
      .insert([
        {
          url: publicUrl,
          type: type,
          file_name: fileName,
          created_at: new Date().toISOString()
        }
      ]);
    
    if (dbError) {
      console.error('DB error detail:', dbError);
      throw dbError;
    }
    
    console.log('Lưu database thành công');
    alert('✅ Upload thành công! Đang tải lại ảnh...');
    
    // Force reload gallery
    await loadMedia();
    
    return publicUrl;
  } catch (error) {
    console.error('Upload error:', error);
    alert('❌ Upload thất bại: ' + error.message);
    return null;
  }
}

// ========== 2. LẤY DANH SÁCH MEDIA ==========
async function loadMedia() {
  try {
    console.log('Đang tải media từ Supabase...');
    
    // Lấy dữ liệu từ database
    const { data, error } = await supabase
      .from('media')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Lỗi load media:', error);
      gallery.innerHTML = `<div class="loading">❌ Lỗi tải dữ liệu: ${error.message}</div>`;
      return;
    }
    
    console.log('Đã tải được', data?.length || 0, 'ảnh/video');
    
    if (!data || data.length === 0) {
      gallery.innerHTML = '<div class="loading">📭 Chưa có ảnh/video nào. Hãy upload lên nhé!</div>';
      return;
    }
    
    // Hiển thị gallery
    renderGallery(data);
    
  } catch (error) {
    console.error('Load media error:', error);
    gallery.innerHTML = `<div class="loading">❌ Lỗi: ${error.message}</div>`;
  }
}

function renderGallery(mediaList) {
  console.log('Render gallery với', mediaList.length, 'items');
  
  gallery.innerHTML = mediaList.map(item => `
    <div class="gallery-item" onclick="window.open('${item.url}', '_blank')">
      ${item.type === 'video' 
        ? `<video src="${item.url}" controls preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>` 
        : `<img src="${item.url}" alt="Shared media" loading="lazy" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://placehold.co/400x400/ff0000/white?text=Error'">`
      }
    </div>
  `).join('');
}

// ========== 3. SETUP REAL-TIME ==========
function setupRealtime() {
  console.log('Đang thiết lập real-time...');
  
  const channel = supabase
    .channel('media_changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'media'
      },
      (payload) => {
        console.log('Phát hiện ảnh mới!', payload.new);
        // Thêm ảnh mới vào đầu gallery mà không cần reload toàn bộ
        const currentItems = document.querySelectorAll('.gallery-item');
        if (currentItems.length === 0) {
          // Nếu gallery đang trống, reload toàn bộ
          loadMedia();
        } else {
          // Thêm item mới vào đầu
          const newItem = document.createElement('div');
          newItem.className = 'gallery-item';
          newItem.onclick = () => window.open(payload.new.url, '_blank');
          newItem.innerHTML = payload.new.type === 'video'
            ? `<video src="${payload.new.url}" controls preload="metadata" style="width:100%;height:100%;object-fit:cover;"></video>`
            : `<img src="${payload.new.url}" alt="Shared media" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`;
          
          gallery.insertBefore(newItem, gallery.firstChild);
        }
      }
    )
    .subscribe((status) => {
      console.log('Real-time status:', status);
    });
  
  return channel;
}

// ========== 4. XỬ LÝ UPLOAD TỪ FILE ==========
uploadBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const type = file.type.startsWith('video/') ? 'video' : 'image';
  alert(`📤 Đang upload ${type}... Vui lòng chờ`);
  
  await uploadFile(file, type);
  fileInput.value = '';
});

// ========== 5. CAMERA (CHỤP ẢNH) ==========
let stream = null;

cameraBtn.addEventListener('click', async () => {
  cameraPreview.classList.remove('hidden');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: { ideal: 3840 }, height: { ideal: 2160 } }, 
      audio: false 
    });
    videoElement.srcObject = stream;
  } catch (err) {
    alert('❌ Không thể truy cập camera: ' + err.message);
    cameraPreview.classList.add('hidden');
  }
});

captureBtn.addEventListener('click', async () => {
  // Đợi một chút để video ổn định
  setTimeout(async () => {
    const context = canvas.getContext('2d');
    canvas.width = videoElement.videoWidth || 1920;
    canvas.height = videoElement.videoHeight || 1080;
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        alert('❌ Không thể chụp ảnh');
        return;
      }
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await uploadFile(file, 'image');
      closeCamera();
    }, 'image/jpeg', 0.95);
  }, 100);
});

function closeCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  cameraPreview.classList.add('hidden');
}

closeCameraBtn.addEventListener('click', closeCamera);

// ========== 6. VIDEO RECORDER ==========
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

// ========== 7. KIỂM TRA KẾT NỐI SUPABASE ==========
async function testSupabaseConnection() {
  console.log('Testing Supabase connection...');
  console.log('URL:', supabaseUrl);
  
  // Test đọc
  const { data, error } = await supabase.from('media').select('count');
  if (error) {
    console.error('Connection error:', error);
    alert('❌ Lỗi kết nối Supabase. Kiểm tra lại environment variables!');
  } else {
    console.log('✅ Kết nối Supabase thành công!');
  }
}

// ========== 8. KHỞI ĐỘNG APP ==========
async function init() {
  console.log('🚀 Khởi động app...');
  await testSupabaseConnection();
  await loadMedia();
  setupRealtime();
}

init();

// PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.log);
}

window.open = window.open.bind(window);