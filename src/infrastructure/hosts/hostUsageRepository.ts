import { ProviderSnapshot, TOOL_DEFINITIONS, UsageRepository } from '../../domain/usage';
import { decodeUsage } from './usageProtocol';

/** A workspace never attempts to read the desktop's authentication database. */
export class HostUsageRepository implements UsageRepository {
  public constructor(
    private readonly readDesktop: () => PromiseLike<unknown>,
    private readonly workspace?: UsageRepository,
    private readonly workspaceLabel = 'Remote',
    private readonly timeoutMs = 20_000,
  ) {}

  public async getUsage(): Promise<readonly ProviderSnapshot[]> {
    const [desktop, workspace] = await Promise.all([
      this.getDesktopUsage(),
      this.getWorkspaceUsage(),
    ]);
    if (!this.workspace) { return desktop; }
    return [
      ...desktop.filter((snapshot) => snapshot.tool === 'cursor').map((snapshot): ProviderSnapshot => ({
        ...snapshot, location: 'local', locationLabel: 'This computer',
      })),
      ...workspace.filter((snapshot) => snapshot.tool !== 'cursor').map((snapshot): ProviderSnapshot => ({
        ...snapshot, location: 'workspace', locationLabel: this.workspaceLabel,
      })),
    ];
  }

  private async getWorkspaceUsage(): Promise<readonly ProviderSnapshot[]> {
    if (!this.workspace) { return []; }
    try {
      return await this.withTimeout(() => this.workspace!.getUsage());
    } catch {
      return (['claude-code', 'codex'] as const).map((tool) => ({
        tool, state: 'unavailable', records: [],
        message: 'Remote usage is temporarily unavailable. AgentMeter will retry automatically.',
      }));
    }
  }

  private async getDesktopUsage(): Promise<readonly ProviderSnapshot[]> {
    try {
      return decodeUsage(await this.withTimeout(this.readDesktop));
    } catch {
      return TOOL_DEFINITIONS.map(({ id }) => ({
        tool: id, state: 'unavailable', records: [],
        message: 'Connecting to this computer. AgentMeter will retry automatically.',
      }));
    }
  }

  private async withTimeout<T>(read: () => PromiseLike<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(read),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Usage connection timed out.')), this.timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
