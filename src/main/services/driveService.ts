import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface PartitionInfo {
  diskNumber: number;
  partitionNumber: number;
  driveLetter?: string;
  label?: string;
  fileSystem?: string;
  size: number;
  formattedSize: string;
  offset: number;
  type: string;
  isBoot: boolean;
  path: string;
  parentDeviceName: string;
  isRemovable: boolean;
}

export interface DriveInfo {
  number: number;
  friendlyName: string;
  busType: string;
  mediaType: string;
  size: number;
  sizeFormatted: string;
  isRemovable: boolean;
  isBoot: boolean;
  operationalStatus: string;
  partitionStyle: string;
  path?: string;
  driveLetter?: string;
  fileSystem?: string;
  label?: string;
  isPartition?: boolean;
  parentDiskNumber?: number;
  partitionNumber?: number;
  offset?: number;
  parentDriveFriendlyName?: string;
  partitions?: PartitionInfo[];
}

export class DriveService {
  private static instance: DriveService | null = null;
  private cachedDrives: DriveInfo[] = [];
  private lastFetchTime = 0;
  private isFetching = false;
  private inflightPromise: Promise<DriveInfo[]> | null = null;

  public static getInstance(): DriveService {
    if (!DriveService.instance) {
      DriveService.instance = new DriveService();
    }
    return DriveService.instance;
  }

  public async detectDrives(forceRefresh = false): Promise<DriveInfo[]> {
    if (process.platform !== 'win32') {
      return [];
    }

    const now = Date.now();
    // Cache valid for 5 seconds unless explicitly forced
    if (!forceRefresh && this.cachedDrives.length > 0 && now - this.lastFetchTime < 5000) {
      return this.cachedDrives;
    }

    if (this.isFetching && this.inflightPromise) {
      return this.inflightPromise;
    }

    this.isFetching = true;
    this.inflightPromise = this.queryWindowsDrives()
      .then((drives) => {
        this.cachedDrives = drives;
        this.lastFetchTime = Date.now();
        return drives;
      })
      .finally(() => {
        this.isFetching = false;
        this.inflightPromise = null;
      });

    return this.inflightPromise;
  }

  public async getDriveInfo(query: number | string): Promise<DriveInfo | null> {
    const drives = await this.detectDrives(false);
    if (typeof query === 'number') {
      const match = drives.find((d) => d.number === query);
      if (match) return match;
    }
    const qStr = String(query).trim().toLowerCase();
    const match = drives.find(
      (d) =>
        d.path?.toLowerCase() === qStr ||
        d.driveLetter?.toLowerCase() === qStr.replace(':', '') ||
        String(d.number) === qStr
    );
    return match || null;
  }

  private async queryWindowsDrives(): Promise<DriveInfo[]> {
    const psScript = `
try {
  $d = @(Get-Disk | Select-Object Number, FriendlyName, BusType, Size, IsBoot, IsSystem, IsOffline, IsReadOnly, OperationalStatus, PartitionStyle)
} catch {
  $d = @(Get-CimInstance Win32_DiskDrive | Select-Object @{N='Number';E={$_.Index}}, @{N='FriendlyName';E={$_.Model}}, @{N='BusType';E={$_.InterfaceType}}, @{N='Size';E={$_.Size}}, @{N='IsBoot';E={$false}}, @{N='OperationalStatus';E={$_.Status}}, @{N='PartitionStyle';E={'MBR'}})
}
try {
  $p = @(Get-Partition | Select-Object DiskNumber, PartitionNumber, DriveLetter, Offset, Size, Type, IsBoot, IsActive, IsHidden, Guid)
} catch {
  $p = @()
}
try {
  $v = @(Get-Volume | Select-Object DriveLetter, FileSystemLabel, FileSystemType, DriveType, Size, SizeRemaining, Path)
} catch {
  $v = @(Get-CimInstance Win32_LogicalDisk | Select-Object @{N='DriveLetter';E={$_.DeviceID.TrimEnd(':')}}, @{N='FileSystemLabel';E={$_.VolumeName}}, @{N='FileSystemType';E={$_.FileSystem}}, @{N='DriveType';E={if($_.DriveType -eq 2){'Removable'}else{'Fixed'}}}, @{N='Size';E={$_.Size}}, @{N='SizeRemaining';E={$_.FreeSpace}}, @{N='Path';E={$_.DeviceID}})
}
[PSCustomObject]@{ Disks = $d; Partitions = $p; Volumes = $v } | ConvertTo-Json -Depth 5 -Compress
`;

    try {
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        {
          windowsHide: true,
          timeout: 10_000,
          maxBuffer: 2 * 1024 * 1024
        }
      );

      if (!stdout || !stdout.trim()) {
        return this.cachedDrives;
      }

      const parsed = JSON.parse(stdout);
      const disks = Array.isArray(parsed.Disks) ? parsed.Disks : parsed.Disks ? [parsed.Disks] : [];
      const partitions = Array.isArray(parsed.Partitions)
        ? parsed.Partitions
        : parsed.Partitions
          ? [parsed.Partitions]
          : [];
      const volumes = Array.isArray(parsed.Volumes)
        ? parsed.Volumes
        : parsed.Volumes
          ? [parsed.Volumes]
          : [];

      const driveResults: DriveInfo[] = [];

      for (const d of disks) {
        if (!d) continue;

        const diskPartsRaw = partitions.filter((p: any) => p && p.DiskNumber === d.Number);
        diskPartsRaw.sort((a: any, b: any) => (a.PartitionNumber || 0) - (b.PartitionNumber || 0));

        const isUsbBus = d.BusType === 'USB';
        const isBootDisk = d.IsBoot === true || d.IsSystem === true;

        const diskPartitionInfos: PartitionInfo[] = [];

        for (const p of diskPartsRaw) {
          const letter = p.DriveLetter ? String(p.DriveLetter).trim().toUpperCase() : undefined;
          const matchingVol = volumes.find((v: any) => {
            if (!v) return false;
            if (letter && v.DriveLetter && String(v.DriveLetter).trim().toUpperCase() === letter) {
              return true;
            }
            if (p.Guid && v.Path && v.Path.includes(p.Guid)) {
              return true;
            }
            return false;
          });

          const isRemovablePart = isUsbBus || (matchingVol && matchingVol.DriveType === 'Removable');
          const isBootPart = p.IsBoot === true || (isBootDisk && letter === 'C');
          const partSize = Number(p.Size) || Number(matchingVol?.Size) || 0;
          const fsType = matchingVol?.FileSystemType || p.Type || 'RAW';
          const label = matchingVol?.FileSystemLabel || '';
          const partPath = letter ? `\\\\.\\${letter}:` : `\\\\.\\PhysicalDrive${d.Number}`;

          diskPartitionInfos.push({
            diskNumber: d.Number,
            partitionNumber: p.PartitionNumber,
            driveLetter: letter,
            label,
            fileSystem: fsType,
            size: partSize,
            formattedSize: this.formatBytes(partSize),
            offset: Number(p.Offset) || 0,
            type: p.Type || 'Partition',
            isBoot: isBootPart,
            path: partPath,
            parentDeviceName: d.FriendlyName || 'Storage Device',
            isRemovable: isRemovablePart
          });
        }

        const hasRemovablePart = diskPartitionInfos.some((p) => p.isRemovable);
        const isRemovable = isUsbBus || hasRemovablePart;
        const letters = diskPartitionInfos.filter((p) => !!p.driveLetter).map((p) => p.driveLetter as string);

        const lettersBadge = letters.length > 0 ? `[${letters.join(':, ')}:] ` : '';
        const partSummary =
          diskPartitionInfos.length > 0
            ? ` (${diskPartitionInfos.length} ${
                diskPartitionInfos.length === 1 ? 'Partition' : 'Partitions'
              }: ${letters.map((l) => `[${l}:]`).join(', ') || 'Raw'})`
            : '';

        // Physical drive
        const parentDriveInfo: DriveInfo = {
          number: d.Number,
          friendlyName: `${lettersBadge}${d.FriendlyName || 'Storage Device'}${partSummary}`,
          busType: d.BusType || (isRemovable ? 'USB' : 'Internal'),
          mediaType:
            d.BusType === 'NVMe'
              ? 'NVMe SSD'
              : isRemovable
                ? 'Removable USB Flash Drive'
                : 'Fixed Physical Disk',
          size: Number(d.Size) || 0,
          sizeFormatted: this.formatBytes(Number(d.Size) || 0),
          isRemovable,
          isBoot: isBootDisk,
          operationalStatus: d.OperationalStatus || 'Online',
          partitionStyle: d.PartitionStyle || 'Unknown',
          path: `\\\\.\\PhysicalDrive${d.Number}`,
          driveLetter: letters.length > 0 ? letters[0] : undefined,
          fileSystem: diskPartitionInfos.length > 0 ? diskPartitionInfos[0].fileSystem : undefined,
          label: diskPartitionInfos.length > 0 ? diskPartitionInfos[0].label : '',
          isPartition: false,
          parentDiskNumber: d.Number,
          parentDriveFriendlyName: d.FriendlyName || 'Storage Device',
          partitions: diskPartitionInfos
        };

        driveResults.push(parentDriveInfo);

        // Partition entries
        for (const p of diskPartitionInfos) {
          const letterPrefix = p.driveLetter ? `[${p.driveLetter}:] ` : '';
          const labelSuffix = p.label ? ` "${p.label}"` : '';
          const partName = `${letterPrefix}Partition ${p.partitionNumber}${labelSuffix} — ${p.parentDeviceName} (${p.formattedSize}, ${p.fileSystem})`;

          driveResults.push({
            number: 1000 + d.Number * 10 + p.partitionNumber,
            friendlyName: partName,
            busType: d.BusType || (p.isRemovable ? 'USB' : 'Internal'),
            mediaType: p.isRemovable ? 'USB Pen Drive Partition' : 'Fixed Disk Partition',
            size: p.size,
            sizeFormatted: p.formattedSize,
            isRemovable: p.isRemovable,
            isBoot: p.isBoot,
            operationalStatus: 'Mounted / Active',
            partitionStyle: d.PartitionStyle || 'Unknown',
            path: p.path,
            driveLetter: p.driveLetter,
            fileSystem: p.fileSystem,
            label: p.label,
            isPartition: true,
            parentDiskNumber: d.Number,
            partitionNumber: p.partitionNumber,
            offset: p.offset,
            parentDriveFriendlyName: d.FriendlyName || 'Storage Device',
            partitions: []
          });
        }
      }

      // Standalone volumes fallback
      for (const v of volumes) {
        if (!v || !v.DriveLetter) continue;
        const letter = String(v.DriveLetter).trim().toUpperCase();
        if (letter === 'C') continue;

        const alreadyIncluded = driveResults.some((dr) => dr.driveLetter === letter);
        if (!alreadyIncluded) {
          const volSize = Number(v.Size) || 0;
          const isRem = v.DriveType === 'Removable';
          driveResults.push({
            number: 900 + letter.charCodeAt(0),
            friendlyName: `[${letter}:] Volume ${v.FileSystemLabel || 'External'} (${v.FileSystemType || 'FAT32'})`,
            busType: isRem ? 'USB' : 'Logical',
            mediaType: isRem ? 'USB Pen Drive Partition' : 'Logical Partition Volume',
            size: volSize,
            sizeFormatted: this.formatBytes(volSize),
            isRemovable: isRem,
            isBoot: false,
            operationalStatus: 'Mounted',
            partitionStyle: v.FileSystemType || 'FAT32',
            path: `\\\\.\\${letter}:`,
            driveLetter: letter,
            fileSystem: v.FileSystemType,
            label: v.FileSystemLabel || '',
            isPartition: true,
            partitionNumber: 1,
            partitions: []
          });
        }
      }

      // Sort: Removable USB items first, parent disk followed by its partitions
      driveResults.sort((a, b) => {
        if (a.isRemovable && !b.isRemovable) return -1;
        if (!a.isRemovable && b.isRemovable) return 1;

        const aParent = a.parentDiskNumber ?? a.number;
        const bParent = b.parentDiskNumber ?? b.number;

        if (aParent !== bParent) {
          return aParent - bParent;
        }

        if (!a.isPartition && b.isPartition) return -1;
        if (a.isPartition && !b.isPartition) return 1;

        return (a.partitionNumber || 0) - (b.partitionNumber || 0);
      });

      return driveResults;
    } catch {
      return this.cachedDrives;
    }
  }

  public formatBytes(bytes: number): string {
    if (bytes <= 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
}

