import { BadRequestException, Injectable } from '@nestjs/common';
import { fileTypeFromBuffer } from 'file-type';

const OFFICE_EXT_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

@Injectable()
export class FileService {
  async validateFileType(file: Express.Multer.File, maxSize?: number): Promise<void> {
    if (!file || !file.buffer) {
      throw new BadRequestException('Invalid file');
    }

    const detectedFileType = await fileTypeFromBuffer(file.buffer);

    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/x-cfb',
      'application/x-ole-storage',
      'text/plain',
      'application/rtf',
      'text/csv',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'image/gif',
      'image/webp',
      'image/avif',
      'application/zip',
      'application/x-rar-compressed',
    ];

    const textBasedMimeTypes = ['text/plain', 'text/csv', 'application/rtf'];
    const originalName = (file.originalname || '').toLowerCase();
    const ext = originalName.includes('.')
      ? originalName.slice(originalName.lastIndexOf('.'))
      : '';
    const officeMime = OFFICE_EXT_MIME[ext];

    let effectiveMime = detectedFileType?.mime || null;
    const zipLike =
      effectiveMime === 'application/zip' ||
      effectiveMime === 'application/x-cfb' ||
      effectiveMime === 'application/x-ole-storage';

    if (officeMime && (!effectiveMime || zipLike)) {
      effectiveMime = officeMime;
    } else if (!effectiveMime && textBasedMimeTypes.includes(file.mimetype)) {
      effectiveMime = file.mimetype;
    } else if (!effectiveMime && officeMime) {
      effectiveMime = officeMime;
    } else if (!effectiveMime && allowedMimeTypes.includes(file.mimetype)) {
      effectiveMime = file.mimetype;
    }

    if (!effectiveMime || !allowedMimeTypes.includes(effectiveMime)) {
      throw new BadRequestException('Invalid file type');
    }

    const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
    const MAX_DOC_SIZE = 5 * 1024 * 1024;

    const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/avif', 'image/webp'].includes(
      effectiveMime,
    );
    const effectiveMax = typeof maxSize === 'number' ? maxSize : isImage ? MAX_IMAGE_SIZE : MAX_DOC_SIZE;

    if (file.size > effectiveMax) {
      const limitInMb = Math.round((effectiveMax / (1024 * 1024)) * 100) / 100;
      throw new BadRequestException(`File size exceeds the ${limitInMb} MB limit`);
    }
  }
}
