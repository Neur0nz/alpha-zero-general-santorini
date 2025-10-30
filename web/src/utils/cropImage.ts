import type { Area } from 'react-easy-crop';

interface CropToFileOptions {
  fileName?: string;
  mimeType?: string;
  quality?: number;
  size?: number;
}

function createImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', reject);
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = source;
  });
}

function getExtensionFromMime(mimeType: string): string {
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
    return 'jpg';
  }
  if (mimeType.includes('png')) {
    return 'png';
  }
  if (mimeType.includes('webp')) {
    return 'webp';
  }
  if (mimeType.includes('gif')) {
    return 'gif';
  }
  return 'png';
}

export async function cropImageToFile(
  imageSrc: string,
  crop: Area,
  { fileName, mimeType = 'image/png', quality = 0.92, size = 512 }: CropToFileOptions = {}
): Promise<File> {
  if (!crop || crop.width <= 0 || crop.height <= 0) {
    throw new Error('Invalid crop selection.');
  }

  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to obtain canvas context.');
  }

  const targetSize = Math.max(64, Math.round(size));
  canvas.width = targetSize;
  canvas.height = targetSize;

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  context.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    targetSize,
    targetSize
  );

  const extension = getExtensionFromMime(mimeType);
  const resolvedFileName = fileName ?? `avatar-${Date.now()}.${extension}`;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((nextBlob) => {
      if (!nextBlob) {
        reject(new Error('Failed to create cropped image blob.'));
        return;
      }
      resolve(nextBlob);
    }, mimeType, quality);
  });

  return new File([blob], resolvedFileName, { type: mimeType });
}
