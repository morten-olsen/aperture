class DatabaseConfig {
  #location = ':memory:';

  public get location() {
    return this.#location;
  }

  public set location(value: string) {
    this.#location = value;
  }
}

export { DatabaseConfig };
