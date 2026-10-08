/**
 * File Signature Definitions for Forensic Carving
 * 
 * Teammates can add new file types (e.g., MP4, WAV, AVI) here
 * without modifying the core scanning engine.
 */

export interface FileSignature {
  name: string;
  category: 'Images' | 'Documents' | 'Archives' | 'Text';
  extensions: string[];
  header: Buffer;
  footer?: Buffer;
  maxSize: number;
  minSize: number;
}

export const SIGNATURES: FileSignature[] = [
  { name: 'JPEG Image', category: 'Images', extensions: ['jpg', 'jpeg'], header: Buffer.from([0xFF, 0xD8, 0xFF]), maxSize: 25 * 1024 * 1024, minSize: 64 },
  { name: 'PNG Image', category: 'Images', extensions: ['png'], header: Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), maxSize: 25 * 1024 * 1024, minSize: 1024 },
  { name: 'PDF Document', category: 'Documents', extensions: ['pdf'], header: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D]), maxSize: 40 * 1024 * 1024, minSize: 512 },
  { name: 'ZIP / Office Doc', category: 'Archives', extensions: ['zip', 'docx', 'xlsx', 'pptx'], header: Buffer.from([0x50, 0x4B, 0x03, 0x04]), maxSize: 50 * 1024 * 1024, minSize: 512 },
  { name: 'GIF Image', category: 'Images', extensions: ['gif'], header: Buffer.from([0x47, 0x49, 0x46, 0x38]), maxSize: 15 * 1024 * 1024, minSize: 100 },
  { name: 'Bitmap Image', category: 'Images', extensions: ['bmp'], header: Buffer.from([0x42, 0x4D]), maxSize: 15 * 1024 * 1024, minSize: 100 },
  { name: 'Plain Text Document', category: 'Text', extensions: ['txt'], header: Buffer.from([0xEF, 0xBB, 0xBF]), maxSize: 5 * 1024 * 1024, minSize: 128 },
  { name: 'MP4 Video', category: 'Archives', extensions: ['mp4'], header: Buffer.from([0x66, 0x74, 0x79, 0x70]), maxSize: 100 * 1024 * 1024, minSize: 1024 }
];
