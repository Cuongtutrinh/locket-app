import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== TẠO ID DUY NHẤT CHO NGƯỜI DÙNG (lưu vào localStorage) ==========
function getDeviceId() {
    let deviceId = localStorage.getItem('locket_device_id');
    if (!deviceId) {
        deviceId = 'user_' + Date.now() + '_' + Math.random().toString(36).substring(2, 15);
        localStorage.setItem('locket_device_id', deviceId);
    }
    return deviceId;
}

const currentDeviceId = getDeviceId();
console.log('Device ID:', currentDeviceId);

// ========== DOM ELEMENTS ==========
const openCameraBtn = document.getElementById('openCameraBtn');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const fileUpload = document.getElementById('fileUpload');
const imageGrid = document.getElementById('imageGrid');
const photoCount = document.getElementById('photoCount');
const cameraScreen = document.getElementById('cameraScreen');
const cameraPreview = document.getElementById('cameraPreview');
const takePhotoBtn = document.getElementById('takePhotoBtn');
const closeCamera = document.getElementById('closeCamera');
const switchCamera = document.getElementById('switchCamera');
const hiddenCanvas = document.getElementById('hiddenCanvas');
const copyBtn = document.getElementById('copyBtn');
const urlText = document.getElementById('urlText');

// Edit modal elements
const editModal = document.getElementById('editModal');
const previewImage = document.getElementById('previewImage');
const commentInput = document.getElementById('commentInput');
const starSpans = document.querySelectorAll('#starRating span');
const closeEditModal = document.getElementById('closeEditModal');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const confirmSendBtn = document.getElementById('confirmSendBtn');

// Detail modal elements
const detailModal = document.getElementById('detailModal');
const detailImage = document.getElementById('detailImage');
const detailRating = document.getElementById('detailRating');
const detailComment = document.getElementById('detailComment');
const detailTime = document.getElementById('detailTime');
const closeDetailModal = document.getElementById('closeDetailModal');

// ========== STATE ==========
let currentStream = null;
let currentFacing = 'environment';
let pendingImageFile = null;
let selectedRating = 0;
let currentMediaList = [];

// ========== HIỂN THỊ MODAL CHỈNH SỬA ==========
function showEditModal(imageBlobOrFile) {
    const url = URL.createObjectURL(imageBlobOrFile);
    previewImage.src = url;
    pendingImageFile = imageBlobOrFile;
    
    commentInput.value = '';
    selectedRating = 0;
    updateStarDisplay();
    
    editModal.classList.remove('hidden');
}

function hideEditModal() {
    editModal.classList.add('hidden');
    if (previewImage.src) {
        URL.revokeObjectURL(previewImage.src);
    }
    pendingImageFile = null;
}

// ========== HIỂN THỊ MODAL CHI TIẾT (có nút xóa nếu là chủ sở hữu) ==========
function showDetailModal(item) {
    detailImage.src = item.url;
    
    // Hiển thị rating sao
    if (item.rating > 0) {
        detailRating.innerHTML = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
    } else {
        detailRating.innerHTML = 'Chưa có đánh giá';
    }
    
    // Hiển thị comment
    if (item.comment && item.comment.trim()) {
        detailComment.innerHTML = item.comment;
    } else {
        detailComment.innerHTML = '<span style="color: rgba(255,255,255,0.5);">Chưa có chú thích</span>';
    }
    
    // Hiển thị thời gian
    if (item.created_at) {
        const date = new Date(item.created_at);
        detailTime.innerHTML = date.toLocaleString('vi-VN');
    } else {
        detailTime.innerHTML = '';
    }
    
    // Kiểm tra xem người dùng hiện tại có phải chủ sở hữu không
    const isOwner = item.device_id === currentDeviceId;
    
    // Thêm hoặc xóa nút xóa trong modal chi tiết
    let deleteBtn = document.getElementById('deletePhotoBtn');
    if (!deleteBtn) {
        const detailInfo = document.querySelector('.detail-info');
        if (detailInfo) {
            deleteBtn = document.createElement('button');
            deleteBtn.id = 'deletePhotoBtn';
            deleteBtn.className = 'delete-photo-btn';
            deleteBtn.innerHTML = '🗑️ Xóa ảnh';
            detailInfo.appendChild(deleteBtn);
        }
    }
    
    if (deleteBtn) {
        if (isOwner) {
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = () => confirmDelete(item);
        } else {
            deleteBtn.style.display = 'none';
        }
    }
    
    detailModal.classList.remove('hidden');
}

function hideDetailModal() {
    detailModal.classList.add('hidden');
    detailImage.src = '';
}

// ========== XÓA ẢNH ==========
async function confirmDelete(item) {
    const confirmed = confirm(`Bạn có chắc chắn muốn xóa ảnh này?\n${item.comment ? 'Chú thích: ' + item.comment : ''}`);
    if (!confirmed) return;
    
    try {
        // Xóa khỏi Storage (lấy đường dẫn từ URL)
        const urlParts = item.url.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `photos/${fileName}`;
        
        const { error: storageError } = await supabase.storage
            .from('locket-media')
            .remove([filePath]);
        
        if (storageError) {
            console.warn('Lỗi xóa file storage:', storageError);
            // Vẫn tiếp tục xóa record trong database
        }
        
        // Xóa khỏi database
        const { error: dbError } = await supabase
            .from('media')
            .delete()
            .eq('id', item.id)
            .eq('device_id', currentDeviceId); // Chỉ xóa nếu đúng device_id
        
        if (dbError) throw dbError;
        
        alert('✅ Đã xóa ảnh thành công!');
        hideDetailModal();
        loadPhotos(); // Refresh lại gallery
        
    } catch (error) {
        console.error('Delete error:', error);
        alert('❌ Xóa ảnh thất bại: ' + error.message);
    }
}

// ========== XỬ LÝ RATING STAR ==========
function updateStarDisplay() {
    starSpans.forEach((span, idx) => {
        if (idx < selectedRating) {
            span.classList.add('active');
            span.textContent = '★';
        } else {
            span.classList.remove('active');
            span.textContent = '☆';
        }
    });
}

starSpans.forEach(star => {
    star.addEventListener('click', (e) => {
        const value = parseInt(star.dataset.value);
        selectedRating = (selectedRating === value) ? 0 : value;
        updateStarDisplay();
        e.stopPropagation();
    });
});

// ========== GỬI ẢNH LÊN SUPABASE ==========
async function uploadPhotoWithMetadata(file, metadata) {
    try {
        const fileName = `${Date.now()}_${file.name}`;
        const filePath = `photos/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
            .from('locket-media')
            .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        const { data: { publicUrl } } = supabase.storage
            .from('locket-media')
            .getPublicUrl(filePath);
        
        const { error: dbError } = await supabase
            .from('media')
            .insert([{
                url: publicUrl,
                type: 'image',
                comment: metadata.comment || '',
                rating: metadata.rating || 0,
                device_id: currentDeviceId,
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

// ========== XỬ LÝ KHI BẤM GỬI ==========
confirmSendBtn.onclick = async () => {
    if (!pendingImageFile) return;
    
    const metadata = {
        comment: commentInput.value,
        rating: selectedRating
    };
    
    await uploadPhotoWithMetadata(pendingImageFile, metadata);
    hideEditModal();
};

cancelEditBtn.onclick = hideEditModal;
closeEditModal.onclick = hideEditModal;
closeDetailModal.onclick = hideDetailModal;

// Click outside để đóng modal chi tiết
detailModal.addEventListener('click', (e) => {
    if (e.target === detailModal) {
        hideDetailModal();
    }
});

// ========== MỞ CAMERA ==========
async function startCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
    }
    
    try {
        const constraints = {
            video: {
                facingMode: { exact: currentFacing },
                width: { ideal: 3840, min: 1920 },
                height: { ideal: 2160, min: 1080 },
                frameRate: { ideal: 30 }
            }
        };
        
        try {
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (err) {
            console.warn('Fallback HD');
            constraints.video.width = { ideal: 1920, min: 1280 };
            constraints.video.height = { ideal: 1080, min: 720 };
            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        }
        
        cameraPreview.srcObject = currentStream;
        await cameraPreview.play();
        
        cameraScreen.setAttribute('data-facing', currentFacing);
        
    } catch (err) {
        console.error('Camera error:', err);
        alert('Không thể mở camera: ' + err.message);
    }
}

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
    
    if (currentFacing === 'user') {
        ctx.save();
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(cameraPreview, 0, 0, width, height);
        ctx.restore();
    } else {
        ctx.drawImage(cameraPreview, 0, 0, width, height);
    }
    
    hiddenCanvas.toBlob(async (blob) => {
        if (!blob) {
            alert('Chụp ảnh thất bại');
            return;
        }
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        closeCameraScreen();
        showEditModal(file);
    }, 'image/jpeg', 0.95);
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
        
        currentMediaList = data || [];
        
        if (!data || data.length === 0) {
            imageGrid.innerHTML = '<div class="loading">📭 Chưa có ảnh nào</div>';
            if (photoCount) photoCount.textContent = '';
            return;
        }
        
        if (photoCount) photoCount.textContent = `${data.length} ảnh`;
        
        imageGrid.innerHTML = data.map((item, index) => {
            const isOwner = item.device_id === currentDeviceId;
            return `
            <div class="image-item" data-index="${index}">
                <img src="${item.url}" alt="photo" loading="lazy">
                ${item.comment ? `<div class="image-comment">💬 ${escapeHtml(item.comment.substring(0, 20))}</div>` : ''}
                ${item.rating > 0 ? `<div class="image-rating">${'★'.repeat(item.rating)}</div>` : ''}
                ${isOwner ? `<div class="image-delete-badge" data-id="${item.id}">🗑️</div>` : ''}
            </div>
        `}).join('');
        
        // Gán sự kiện click cho từng ảnh
        document.querySelectorAll('.image-item').forEach((item, idx) => {
            const actualIndex = parseInt(item.dataset.index);
            
            // Click vào ảnh (trừ khi click vào nút xóa)
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('image-delete-badge')) {
                    if (currentMediaList[actualIndex]) {
                        showDetailModal(currentMediaList[actualIndex]);
                    }
                }
            });
            
            // Gán sự kiện xóa cho badge
            const deleteBadge = item.querySelector('.image-delete-badge');
            if (deleteBadge) {
                deleteBadge.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const photoId = deleteBadge.dataset.id;
                    const photoItem = currentMediaList.find(p => p.id == photoId);
                    if (photoItem) {
                        const confirmed = confirm('Xóa ảnh này?');
                        if (confirmed) {
                            await deletePhotoById(photoId, photoItem.url);
                        }
                    }
                });
            }
        });
        
    } catch (error) {
        console.error('Load error:', error);
        imageGrid.innerHTML = '<div class="loading">❌ Lỗi tải ảnh</div>';
    }
}

// Hàm xóa ảnh theo ID
async function deletePhotoById(photoId, photoUrl) {
    try {
        // Xóa khỏi Storage
        const urlParts = photoUrl.split('/');
        const fileName = urlParts[urlParts.length - 1];
        const filePath = `photos/${fileName}`;
        
        await supabase.storage.from('locket-media').remove([filePath]);
        
        // Xóa khỏi database
        const { error } = await supabase
            .from('media')
            .delete()
            .eq('id', photoId)
            .eq('device_id', currentDeviceId);
        
        if (error) throw error;
        
        alert('✅ Đã xóa ảnh!');
        loadPhotos();
        
    } catch (error) {
        console.error('Delete error:', error);
        alert('❌ Xóa thất bại: ' + error.message);
    }
}

// Hàm escape HTML để hiển thị emoji an toàn
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
    showEditModal(file);
    fileUpload.value = '';
};

// ========== ĐÓNG/MỞ CAMERA ==========
function openCameraScreen() {
    cameraScreen.classList.remove('hidden');
    startCamera();
}

function closeCameraScreen() {
    cameraScreen.classList.add('hidden');
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    cameraPreview.srcObject = null;
}

function switchCameraMode() {
    currentFacing = currentFacing === 'environment' ? 'user' : 'environment';
    startCamera();
}

// ========== REAL-TIME ==========
function setupRealtime() {
    supabase
        .channel('photos')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'media' },
            () => loadPhotos()
        )
        .on('postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'media' },
            () => loadPhotos()
        )
        .subscribe();
}

// ========== HIỂN THỊ URL ==========
if (urlText && copyBtn) {
    urlText.textContent = window.location.href;
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(window.location.href);
        alert('✅ Đã copy link!');
    };
}

// ========== GÁN SỰ KIỆN ==========
if (openCameraBtn) openCameraBtn.onclick = openCameraScreen;
if (closeCamera) closeCamera.onclick = closeCameraScreen;
if (takePhotoBtn) takePhotoBtn.onclick = takePhoto;
if (switchCamera) switchCamera.onclick = switchCameraMode;
if (uploadImageBtn) uploadImageBtn.onclick = uploadFromFile;

// ========== KHỞI ĐỘNG ==========
loadPhotos();
setupRealtime();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(console.log);
}

window.open = window.open.bind(window);