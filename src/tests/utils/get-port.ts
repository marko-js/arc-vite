import net from "net";
export function getPort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server
      .unref()
      .on("error", reject)
      .listen(0, () => {
        const { port } = server.address() as net.AddressInfo;
        server.close(() => resolve(port));
      });
  });
}
