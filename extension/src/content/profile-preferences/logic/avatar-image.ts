const MAX_SOURCE_FILE_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE_PX = 256;
const MAX_AVATAR_DATA_URL_LENGTH = 300_000;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('This image could not be opened.'));
    image.src = url;
  });
}

export async function createAvatarDataUrl(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP image.');
  }
  if (file.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error('Choose an image smaller than 5 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (!sourceSize) throw new Error('This image has no visible content.');

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Avatar processing is unavailable.');

    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, AVATAR_SIZE_PX, AVATAR_SIZE_PX);

    const dataUrl = canvas.toDataURL('image/webp', 0.82);
    if (dataUrl.length > MAX_AVATAR_DATA_URL_LENGTH) {
      throw new Error('The processed avatar is too large. Try another image.');
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
