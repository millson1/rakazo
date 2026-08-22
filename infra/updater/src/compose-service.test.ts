import { readFileSync } from "node:fs";
import path from "node:path";
import { RECREATED_SERVICES } from "@rakazo/core";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface ComposeService {
  image?: string;
  ports?: unknown[];
  networks?: string[];
  volumes?: string[];
  environment?: Record<string, string>;
  command?: unknown;
  user?: string;
}

const composeFile = path.resolve(
  import.meta.dirname,
  "../../compose/docker-compose.prod.yml",
);
const compose = parse(readFileSync(composeFile, "utf8")) as {
  services: Record<string, ComposeService>;
  networks: Record<string, unknown>;
};
const updater = compose.services.updater as ComposeService;

/**
 * The updater and sandbox supervisor hold the Docker socket, which is root-equivalent on the host.
 * These are the properties that keep that from being reachable from the edge, and they are easy to
 * break by accident in YAML, so they are asserted rather than reviewed.
 */
describe("the updater compose service", () => {
  it("exists and runs the updater image", () => {
    expect(updater).toBeDefined();
    expect(updater.image).toMatch(/updater/);
  });

  it("publishes nothing on the host", () => {
    expect(updater.ports).toBeUndefined();
  });

  it("stays off the edge network, so Caddy has no route to it", () => {
    expect(updater.networks).toEqual(["app"]);
    expect(compose.services.caddy?.networks).toContain("edge");
    expect(compose.services.caddy?.networks).not.toContain("data");
  });

  it("shares the Docker socket only with the unpublished sandbox supervisor", () => {
    const withSocket = Object.entries(compose.services)
      .filter(([, service]) =>
        (service.volumes ?? []).some((volume) => volume.includes("docker.sock")),
      )
      .map(([name]) => name)
      .sort();
    expect(withSocket).toEqual(["supervisor", "updater"]);
  });

  it("is bind-mounted at the same path it has on the host", () => {
    const mount = (updater.volumes ?? []).find((volume) => volume.includes("RAKAZO_DEPLOY_DIR"));
    const [source, destination] = (mount ?? "").split(":").reduce<string[]>((parts, piece) => {
      // The value carries a `:?` default, so split on the separator between source and destination.
      if (parts.length === 0 || piece.startsWith("$") || piece.startsWith("/")) parts.push(piece);
      else parts[parts.length - 1] = `${parts[parts.length - 1]}:${piece}`;
      return parts;
    }, []);
    expect(source).toBe(destination);
  });

  it("is not one of the services an update recreates", () => {
    expect(RECREATED_SERVICES).not.toContain("updater");
    for (const service of RECREATED_SERVICES) {
      expect(Object.keys(compose.services)).toContain(service);
    }
  });

  it("pins its own image tag separately from the application image", () => {
    expect(updater.image).toContain("RAKAZO_UPDATER_IMAGE_TAG");
    for (const service of RECREATED_SERVICES) {
      expect(compose.services[service]?.image).toContain("RAKAZO_IMAGE_TAG");
    }
  });

  it("does not let the api container reach the Docker socket to update itself", () => {
    expect(compose.services.api?.volumes ?? []).not.toContain("/var/run/docker.sock");
    expect(compose.services.api?.environment?.RAKAZO_UPDATER_URL).toBe("http://updater:7092");
  });
});

describe("the production sandbox default", () => {
  it("defaults SANDBOX_PROVIDER to docker instead of forcing e2b", () => {
    expect(compose.services.api?.environment?.SANDBOX_PROVIDER).toBe("${SANDBOX_PROVIDER:-docker}");
    expect(compose.services.worker?.environment?.SANDBOX_PROVIDER).toBe(
      "${SANDBOX_PROVIDER:-docker}",
    );
  });

  it("runs an unpublished supervisor on the app network so Docker computers work", () => {
    const supervisor = compose.services.supervisor;
    expect(supervisor).toBeDefined();
    expect(supervisor?.ports).toBeUndefined();
    expect(supervisor?.networks).toEqual(["app"]);
    expect(supervisor?.image).toContain("RAKAZO_IMAGE_TAG");
    expect(compose.services.computer?.image).toMatch(/computer/);
    expect(compose.services.api?.environment?.SANDBOX_SUPERVISOR_URL).toBe(
      "http://supervisor:7091",
    );
    expect(compose.services.worker?.environment?.SANDBOX_SUPERVISOR_URL).toBe(
      "http://supervisor:7091",
    );
  });
});
