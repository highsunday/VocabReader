import {
  isLearningLanguage,
  learningLanguages,
  type LearningLanguage
} from "../shared/settings-contracts";

export class LearningLanguageWorkspaceRegistry<T extends object> {
  #activeLanguage: LearningLanguage;

  constructor(
    initialLanguage: LearningLanguage,
    private readonly resources: Record<LearningLanguage, T>
  ) {
    if (!isLearningLanguage(initialLanguage)) {
      throw new Error("Unsupported learning language");
    }
    this.#activeLanguage = initialLanguage;
  }

  get language(): LearningLanguage {
    return this.#activeLanguage;
  }

  get active(): T {
    return this.resources[this.#activeLanguage];
  }

  switchTo(language: LearningLanguage): T {
    if (!isLearningLanguage(language)) {
      throw new Error("Unsupported learning language");
    }
    this.#activeLanguage = language;
    return this.active;
  }

  forLanguage(language: LearningLanguage): T {
    if (!isLearningLanguage(language)) {
      throw new Error("Unsupported learning language");
    }
    return this.resources[language];
  }

  all(): Array<[LearningLanguage, T]> {
    return learningLanguages.map((language) => [language, this.resources[language]]);
  }
}

export function createActiveWorkspaceProxy<T extends object>(
  registry: LearningLanguageWorkspaceRegistry<T>
): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const resource = registry.active;
      const value = Reflect.get(resource, property, resource) as unknown;
      return typeof value === "function" ? value.bind(resource) : value;
    },
    set(_target, property, value) {
      return Reflect.set(registry.active, property, value, registry.active);
    }
  });
}
