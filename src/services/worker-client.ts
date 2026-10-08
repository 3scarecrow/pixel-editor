export class CodecClient {
  private worker: Worker | null = null;
  private disposed = false;
  private serial = 0;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      progress?: (n: number) => void;
    }
  >();
  constructor() {
    this.start();
  }
  private start() {
    this.worker = new Worker(
      new URL("../workers/codec.worker.ts", import.meta.url),
    );
    this.worker.onmessage = ({ data }) => {
      const task = this.pending.get(data.id);
      if (!task) return;
      if (data.progress !== undefined) {
        task.progress?.(data.progress);
        return;
      }
      this.pending.delete(data.id);
      if (data.error) task.reject(Error(data.error));
      else task.resolve(data.result);
    };
    this.worker.onerror = () => {
      this.fail("图片处理线程异常，请重试");
      this.worker?.terminate();
      this.worker = null;
    };
  }
  request<T>(
    type: string,
    payload: unknown,
    transfer: Transferable[] = [],
    progress?: (n: number) => void,
  ): Promise<T> {
    if (this.disposed) return Promise.reject(Error("任务已取消"));
    if (!this.worker) this.start();
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, progress });
      try {
        this.worker!.postMessage({ id, type, payload }, transfer);
      } catch (e) {
        this.pending.delete(id);
        reject(e);
      }
    });
  }
  private fail(message: string) {
    this.pending.forEach((t) => t.reject(Error(message)));
    this.pending.clear();
  }
  destroy() {
    this.disposed = true;
    this.fail("任务已取消");
    this.worker?.terminate();
    this.worker = null;
  }
}
