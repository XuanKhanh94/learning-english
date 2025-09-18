// Cloudinary configuration and upload utilities
export const CLOUDINARY_CONFIG = {
  cloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME,
  uploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || 'ml_default',
};

// Debug logging
('Cloudinary Config:', {
  cloudName: CLOUDINARY_CONFIG.cloudName ? 'Present' : 'Missing',
  uploadPreset: CLOUDINARY_CONFIG.uploadPreset ? 'Present' : 'Missing',
  note: 'Files will be stored in Cloudinary, user data in Firebase'
});

if (!CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
  console.error('❌ Missing Cloudinary configuration. Using default preset.');
  console.error('Cloud Name:', CLOUDINARY_CONFIG.cloudName || 'MISSING');
  console.error('Upload Preset:', CLOUDINARY_CONFIG.uploadPreset || 'Using ml_default');
}

export interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  original_filename: string;
  format: string;
  bytes: number;
  created_at: string;
}

export const uploadToCloudinary = async (
  file: File,
  folder: string = 'assignments'
): Promise<CloudinaryUploadResult> => {
  if (!CLOUDINARY_CONFIG.cloudName || !CLOUDINARY_CONFIG.uploadPreset) {
    throw new Error('Cloudinary configuration missing for file storage');
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  formData.append('folder', folder);

  // Add timestamp to filename to avoid conflicts
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  formData.append('public_id', `${timestamp}_${sanitizedName}`);

  try {
    ('Uploading to Cloudinary:', {
      fileName: file.name,
      size: file.size,
      folder,
      cloudName: CLOUDINARY_CONFIG.cloudName,
      note: 'Files stored in Cloudinary, metadata in Firebase Firestore'
    });

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/auto/upload`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Cloudinary upload error:', errorData);
      throw new Error(`Cloudinary upload failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    ('File uploaded to Cloudinary successfully:', result.secure_url);

    return result;
  } catch (error) {
    console.error('Error uploading file to Cloudinary:', error);
    throw error;
  }
};

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  // Note: Deleting from Cloudinary requires server-side implementation
  // with API secret. This is just a placeholder for future implementation.
  ('Delete from Cloudinary (requires server-side):', publicId);
};