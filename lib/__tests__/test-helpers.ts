import assert from "node:assert/strict";

interface Matchers {
  readonly not: Matchers;
  toBe(expected: unknown): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeDefined(): void;
  toContain(expected: unknown): void;
  toHaveProperty(property: string): void;
  toThrow(): void;
  toBeLessThan(expected: number): void;
}

function createMatchers(actual: unknown, negated = false): Matchers {
  const verify = (condition: boolean, message: string) => {
    assert.ok(negated ? !condition : condition, negated ? `not: ${message}` : message);
  };

  return {
    get not() {
      return createMatchers(actual, !negated);
    },
    toBe(expected) {
      verify(Object.is(actual, expected), `expected ${String(actual)} to be ${String(expected)}`);
    },
    toBeNull() {
      verify(actual === null, `expected ${String(actual)} to be null`);
    },
    toBeTruthy() {
      verify(Boolean(actual), `expected ${String(actual)} to be truthy`);
    },
    toBeDefined() {
      verify(actual !== undefined, "expected value to be defined");
    },
    toContain(expected) {
      const contains = Array.isArray(actual)
        ? actual.includes(expected)
        : typeof actual === "string" && actual.includes(String(expected));
      verify(contains, `expected value to contain ${String(expected)}`);
    },
    toHaveProperty(property) {
      const hasProperty = typeof actual === "object" && actual !== null && property in actual;
      verify(hasProperty, `expected value to have property ${property}`);
    },
    toThrow() {
      let didThrow = false;
      if (typeof actual === "function") {
        try {
          actual();
        } catch {
          didThrow = true;
        }
      }
      verify(didThrow, "expected function to throw");
    },
    toBeLessThan(expected) {
      verify(typeof actual === "number" && actual < expected, `expected ${String(actual)} to be less than ${expected}`);
    },
  };
}

export function expect(actual: unknown): Matchers {
  return createMatchers(actual);
}
