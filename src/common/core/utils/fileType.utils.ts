import { BadRequestException, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

@Injectable()
export class FileService {
  async validateFileType(file: Express.Multer.File, maxSize?: number): Promise<void> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file');
    }

    const detectedFileType = await fileTypeFromBuffer(file.buffer);

    // List of allowed MIME types
    const allowedMimeTypes = [
      // Document types
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'application/rtf',
      'text/csv',
      
      // Image types
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/avif',
      
      // Archive types
      'application/zip',
      'application/x-rar-compressed',
    ];

    // Check if detected file type is in the allowed types
    if (!detectedFileType || !allowedMimeTypes.includes(detectedFileType.mime)) {
      throw new BadRequestException('Invalid file type');
    }

    // Validate file size
    const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2 MB
    const MAX_DOC_SIZE = 5 * 1024 * 1024; // 5 MB

    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/avif', 'image/webp'].includes(
      detectedFileType.mime,
    );
    const effectiveMax = typeof maxSize === 'number' ? maxSize : isImage ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;

    if (file.size > effectiveMax) {
      const limitInMb = Math.round((effectiveMax / (1024 * 1024)) * 100) / 100;
      throw new BadRequestException(`File size exceeds the ${limitInMb} MB limit`);
    }
  }
}
