// Account page: crop & shrink a chosen profile picture to 256×256 before it's uploaded.
(() => {
  const input = document.getElementById('avatar-input');
  const preview = document.getElementById('avatar-preview');
  const save = document.getElementById('avatar-save');
  const status = document.getElementById('avatar-status');
  if (!input || !window.DataTransfer || !HTMLCanvasElement.prototype.toBlob) return;

  save.disabled = true;
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    status.textContent = '';
    save.disabled = true;
    try {
      const bitmap = await createImageBitmap(file);
      const side = Math.min(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      input.files = dt.files;
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      img.alt = 'New profile picture preview';
      preview.appendChild(img);
      save.disabled = false;
      status.textContent = 'Looks good? Press Save picture.';
    } catch {
      status.textContent = 'We couldn’t read that image. Try a JPEG or PNG.';
    }
  });
})();
