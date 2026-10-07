import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { app } from 'electron';
import { Database, openDatabase } from '../persistence/database';
import { AuditRepository } from '../persistence/repositories/auditRepository';
import { SigningKeystore } from '../crypto/keystore';
import { PermissionGuard } from '../security/permissionGuard';

export class ServiceContext {
  private static instance: ServiceContext | null = null;

  public readonly userDataDir: string;
  public readonly reportsDir: string;
  public readonly tempDir: string;
  public readonly keystore: SigningKeystore;
  public readonly permissionGuard: PermissionGuard;
  private _database: Database | null = null;
  private _auditRepository: AuditRepository | null = null;

  constructor(customUserDataDir?: string) {
    if (customUserDataDir) {
      this.userDataDir = customUserDataDir;
    } else {
      try {
        if (app && typeof app.getPath === 'function') {
          this.userDataDir = app.getPath('userData');
        } else {
          this.userDataDir = this.getDefaultFallbackUserDataDir();
        }
      } catch {
        this.userDataDir = this.getDefaultFallbackUserDataDir();
      }
    }

    this.reportsDir = path.join(this.userDataDir, 'reports');
    try {
      if (app && typeof app.getPath === 'function') {
        this.tempDir = app.getPath('temp');
      } else {
        this.tempDir = os.tmpdir();
      }
    } catch {
      this.tempDir = os.tmpdir();
    }

    this.ensureDirs();

    this.keystore = new SigningKeystore(this.userDataDir);
    this.keystore.loadOrCreate();

    // Default permission guard: allows role fallback for bootstrap examiner/operator
    this.permissionGuard = new PermissionGuard({ allowRoleFallback: true });
  }

  private getDefaultFallbackUserDataDir(): string {
    const home = process.env.APPDATA ||
      (process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : path.join(os.homedir(), '.config'));
    return path.join(home, 'cybersanitize-forensic-tool');
  }

  private ensureDirs(): void {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  public async getDatabase(): Promise<Database> {
    if (!this._database) {
      this._database = await openDatabase({ directory: this.userDataDir });
    }
    return this._database;
  }

  public async getAuditRepository(): Promise<AuditRepository> {
    if (!this._auditRepository) {
      const db = await this.getDatabase();
      this._auditRepository = new AuditRepository(db.driver, this.keystore);
    }
    return this._auditRepository;
  }

  public static getInstance(customUserDataDir?: string): ServiceContext {
    if (!ServiceContext.instance) {
      ServiceContext.instance = new ServiceContext(customUserDataDir);
    }
    return ServiceContext.instance;
  }

  public static setInstance(instance: ServiceContext | null): void {
    ServiceContext.instance = instance;
  }
}

