declare namespace chrome {
  namespace runtime {
    interface Manifest {
      name: string;
      version: string;
    }

    interface InstalledDetails {
      reason: string;
    }

    type MessageSender = object;

    type SendResponse = (response?: unknown) => void;

    function getManifest(): Manifest;

    const onInstalled: {
      addListener(listener: (details: InstalledDetails) => void): void;
    };

    const onStartup: {
      addListener(listener: () => void): void;
    };

    const onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: MessageSender,
          sendResponse: SendResponse
        ) => boolean | void
      ): void;
    };
  }
}
