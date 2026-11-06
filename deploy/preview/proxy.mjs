import { isIP } from "node:net";

// The caller must verify that the address belongs to the intended ZeroTier interface.
export function generatePreviewCaddyConfig({ address, ports, sockets }) {
  if (typeof address !== "string" || isIP(address) !== 4) {
    throw new TypeError("address must be a valid IPv4 address");
  }
  const first = Number(address.split(".")[0]);
  if (first === 0 || first === 127 || first >= 224) {
    throw new TypeError("address must be a unicast interface address");
  }
  if (!Array.isArray(ports) || ports.length !== 2 || !(0 in ports) || !(1 in ports) ||
      ports.some((port) => !Number.isInteger(port) || port < 1024 || port > 65535) ||
      ports[0] === ports[1]) {
    throw new TypeError("ports must be two distinct nonprivileged ports");
  }
  if (!Array.isArray(sockets) || sockets.length !== 2 || !(0 in sockets) || !(1 in sockets) || sockets.some((socket) =>
    typeof socket !== "string" || !/^\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+$/.test(socket) ||
    socket.split("/").some((part) => part === "." || part === ".."))) {
    throw new TypeError("sockets must be safe absolute Unix socket paths");
  }
  const sites = ports.map((port, i) => `https://${address}:${port} {\n\tbind ${address}\n\ttls internal\n\treverse_proxy unix/${sockets[i]}\n}`);
  return `{\n\tauto_https off\n}\n\n# Internal CA is untrusted until browser trust is provisioned separately.\n# Binding alone does not prove firewall policy; verify it separately.\n${sites.join("\n\n")}\n`;
}
