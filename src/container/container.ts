/**
 * Minimal typed dependency-injection container.
 *
 * Replaces the hand-written service factory every backend grows: register
 * providers by key, resolve them lazily (memoized singletons by default), with
 * full type inference — no decorators, no reflect-metadata, no runtime magic.
 */

export type Provider<T, Registry extends Record<string, unknown>> = (container: Container<Registry>) => T;

export interface RegisterOptions {
  /**
   * `true` (default): the provider runs once and the value is cached.
   * `false`: the provider runs on every `resolve` (transient).
   */
  singleton?: boolean;
}

/** Error thrown when resolving an unknown or cyclically-dependent token. */
export class ContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContainerError";
  }
}

/**
 * A container over a `Registry` type mapping tokens → produced types.
 * Grow the type as you register with {@link Container.register} returning a
 * widened container.
 */
export class Container<Registry extends Record<string, unknown> = {}> {
  private readonly providers = new Map<string, { fn: Provider<unknown, Registry>; singleton: boolean }>();
  private readonly instances = new Map<string, unknown>();
  private readonly resolving = new Set<string>();

  /**
   * Register a provider under `token`. Returns a container typed to also know
   * `token → T`, so downstream `resolve(token)` is fully inferred.
   */
  register<Token extends string, T>(
    token: Token,
    provider: Provider<T, Registry>,
    options: RegisterOptions = {},
  ): Container<Registry & Record<Token, T>> {
    const next = this as unknown as Container<Registry & Record<Token, T>>;
    (next as unknown as { providers: Map<string, unknown> }).providers.set(token, {
      fn: provider as unknown as Provider<unknown, Registry & Record<Token, T>>,
      singleton: options.singleton ?? true,
    });
    return next;
  }

  /** Register a ready-made value (always a singleton). */
  value<Token extends string, T>(token: Token, value: T): Container<Registry & Record<Token, T>> {
    return this.register(token, () => value);
  }

  /** True when a provider is registered for `token`. */
  has(token: keyof Registry & string): boolean {
    return this.providers.has(token);
  }

  /** Resolve a token to its value, instantiating (and caching, if singleton) as needed. */
  resolve<Token extends keyof Registry & string>(token: Token): Registry[Token] {
    const key = token as string;
    const entry = this.providers.get(key);
    if (!entry) throw new ContainerError(`No provider registered for "${key}"`);

    if (entry.singleton && this.instances.has(key)) {
      return this.instances.get(key) as Registry[Token];
    }
    if (this.resolving.has(key)) {
      throw new ContainerError(`Circular dependency detected while resolving "${key}"`);
    }

    this.resolving.add(key);
    try {
      const value = entry.fn(this as unknown as Container<Registry>);
      if (entry.singleton) this.instances.set(key, value);
      return value as Registry[Token];
    } finally {
      this.resolving.delete(key);
    }
  }

  /** Clear cached singleton instances (providers stay registered). Handy in tests. */
  reset(): void {
    this.instances.clear();
  }
}

/** Create an empty typed container. */
export function createContainer(): Container {
  return new Container();
}
