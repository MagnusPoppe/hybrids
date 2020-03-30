/* eslint-disable no-use-before-define, no-console */
import * as cache from "./cache.js";

export const connect = `__store__connect__${Date.now()}__`;

const definitions = new WeakMap();
const placeholders = new WeakSet();
export const _ = (h, v) => v;

// UUID v4 generator thanks to https://gist.github.com/jed/982883
function uuid(temp) {
  return temp
    ? // eslint-disable-next-line no-bitwise, no-mixed-operators
      (temp ^ ((Math.random() * 16) >> (temp / 4))).toString(16)
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid);
}

export function setPendingState(model, value) {
  cache.set(model, "pending", _, value, true);
  return model;
}

export function getPendingState(model) {
  return cache.get(model, "pending", _) || false;
}

export function stringifyParameters(parameters) {
  switch (typeof parameters) {
    case "object":
      return JSON.stringify(
        Object.keys(parameters)
          .sort()
          .reduce((acc, key) => {
            if (
              typeof parameters[key] === "object" &&
              parameters[key] !== null
            ) {
              throw TypeError(
                `You must use primitive value for '${key}' key: ${typeof parameters[
                  key
                ]}`,
              );
            }
            acc[key] = parameters[key];
            return acc;
          }, {}),
      );
    case "undefined":
      return undefined;
    default:
      return String(parameters);
  }
}

function resolveWithInvalidate(config, model, lastModel) {
  if (error(model) || !lastModel) {
    config.invalidate();
  }
  return model;
}

function sync(config, id, model, invalidate) {
  cache.set(config, id, invalidate ? resolveWithInvalidate : _, model, true);
  return setPendingState(model, false);
}

let currentTimestamp;
function getCurrentTimestamp() {
  if (!currentTimestamp) {
    currentTimestamp = Date.now();
    requestAnimationFrame(() => {
      currentTimestamp = undefined;
    });
  }
  return currentTimestamp;
}

const timestamps = new WeakMap();

function getTimestamp(model) {
  let timestamp = timestamps.get(model);

  if (!timestamp) {
    timestamp = getCurrentTimestamp();
    timestamps.set(model, timestamp);
  }

  return timestamp;
}

function setTimestamp(model) {
  timestamps.set(model, getCurrentTimestamp());
  return model;
}

function setupStorage(storage) {
  if (typeof storage === "function") storage = { get: storage };

  const result = { cache: true, ...storage };

  if (result.cache === false || result.cache === 0) {
    result.validate = cachedModel =>
      !cachedModel || getTimestamp(cachedModel) === getCurrentTimestamp();
  } else if (typeof result.cache === "number") {
    result.validate = cachedModel =>
      !cachedModel ||
      getTimestamp(cachedModel) + result.cache > getCurrentTimestamp();
  } else if (result.cache !== true) {
    throw TypeError(
      `Storage cache property must be a boolean or number: ${typeof result.cache}`,
    );
  }

  return Object.freeze(result);
}

function memoryStorage(config) {
  return {
    get: config.enumerable ? () => {} : () => config.create({}),
    set: () => {},
    list:
      config.enumerable &&
      function list(parameters) {
        if (parameters) {
          throw TypeError(
            `Memory-based model definition does not support parameters`,
          );
        }

        return cache.getEntries(config).reduce((acc, { key, value }) => {
          if (key === config) return acc;
          if (value && !error(value)) acc.push(key);
          return acc;
        }, []);
      },
  };
}

function bootstrap(Model, options) {
  if (Array.isArray(Model)) return setupListModel(Model[0], options);
  return setupModel(Model);
}

function mapError(config, err, id, proxyKeys) {
  /* istanbul ignore next */
  if (process.env.NODE_ENV !== "production" && console.error) {
    console.error(err);
  }

  if (!(err instanceof Error)) {
    err = Error(`Non-error exception has been thrown: ${err}`);
  }

  proxyKeys.forEach(key => {
    Object.defineProperty(err, key, {
      get: () => {
        throw Error(
          `Try to get '${key}' in error state - use store.error() guard`,
        );
      },
      enumerable: true,
    });
  });

  definitions.set(err, { config, id });

  return err;
}

function getTypeConstructor(type, key) {
  switch (type) {
    case "string":
      return String;
    case "number":
      return Number;
    case "boolean":
      return Boolean;
    default:
      throw TypeError(
        `The value for the '${key}' array must be a string, number or boolean: ${type}`,
      );
  }
}

const configs = new WeakMap();
function setupModel(Model) {
  if (typeof Model !== "object" || Model === null) {
    throw TypeError(`Model definition must be an object: ${typeof Model}`);
  }
  let config = configs.get(Model);

  if (!config) {
    const storage = Model[connect];
    if (storage) delete Model[connect];

    const errorKeys = [];
    let invalidatePromise;

    config = {
      external: !!storage,
      enumerable: hasOwnProperty.call(Model, "id"),
      placeholder: {},
      mapError: (err, id) => mapError(config, err, id, errorKeys),
      invalidate: () => {
        if (!invalidatePromise) {
          invalidatePromise = Promise.resolve().then(() => {
            cache.invalidate(config, config, true);
            invalidatePromise = null;
          });
        }
      },
    };

    config.storage = setupStorage(storage || memoryStorage(config, Model));

    const transform = Object.keys(Object.freeze(Model)).map(key => {
      Object.defineProperty(config.placeholder, key, {
        get: () => {
          throw Error(
            `Try to get '${key}' in pending state - use store.pending() or store.ready() guards`,
          );
        },
        enumerable: true,
      });

      if (!(key in Error.prototype)) errorKeys.push(key);

      if (key === "id") {
        if (Model[key] !== true) {
          throw TypeError(
            `The 'id' property must be true or undefined: ${typeof Model[key]}`,
          );
        }
        return (model, data, lastModel) => {
          const id = lastModel
            ? lastModel.id
            : (hasOwnProperty.call(data, "id") && String(data.id)) ||
              String(uuid());
          Object.defineProperty(model, "id", { value: id });
        };
      }

      const type = typeof Model[key];
      const defaultValue = Model[key];

      switch (type) {
        case "function":
          return model => {
            Object.defineProperty(model, key, {
              get() {
                return cache.get(this, key, defaultValue);
              },
            });
          };
        case "object": {
          if (defaultValue === null) {
            throw TypeError(
              `The value for the '${key}' must be an object instance: ${defaultValue}`,
            );
          }

          const isArray = Array.isArray(defaultValue);

          if (isArray) {
            const nestedType = typeof defaultValue[0];

            if (nestedType !== "object") {
              const Constructor = getTypeConstructor(nestedType, key);
              const defaultArray = Object.freeze(defaultValue.map(Constructor));
              return (model, data, lastModel) => {
                if (hasOwnProperty.call(data, key)) {
                  if (!Array.isArray(data[key])) {
                    throw TypeError(
                      `The value for '${key}' property must be an array: ${typeof data[
                        key
                      ]}`,
                    );
                  }
                  model[key] = Object.freeze(data[key].map(Constructor));
                } else if (lastModel && hasOwnProperty.call(lastModel, key)) {
                  model[key] = lastModel[key];
                } else {
                  model[key] = defaultArray;
                }
              };
            }

            const localConfig = bootstrap(defaultValue, { nested: true });

            if (localConfig.enumerable && defaultValue[1]) {
              const nestedOptions = defaultValue[1];
              if (typeof nestedOptions !== "object") {
                throw TypeError(
                  `Options for '${key}' array property must be an object instance: ${typeof nestedOptions}`,
                );
              }
              if (nestedOptions.loose) {
                config.contexts = config.contexts || new Set();
                config.contexts.add(bootstrap(defaultValue[0]));
              }
            }
            return (model, data, lastModel) => {
              if (hasOwnProperty.call(data, key)) {
                if (!Array.isArray(data[key])) {
                  throw TypeError(
                    `The value for '${key}' property must be an array: ${typeof data[
                      key
                    ]}`,
                  );
                }
                model[key] = localConfig.create(data[key]);
              } else {
                model[key] =
                  (lastModel && lastModel[key]) ||
                  (localConfig.enumerable
                    ? []
                    : localConfig.create(defaultValue));
              }
            };
          }

          const nestedConfig = bootstrap(defaultValue);
          if (nestedConfig.enumerable || nestedConfig.external) {
            return (model, data, lastModel) => {
              let resultModel;

              if (hasOwnProperty.call(data, key)) {
                const nestedData = data[key];

                if (typeof nestedData !== "object" || nestedData === null) {
                  if (nestedData !== undefined && nestedData !== null) {
                    resultModel = { id: nestedData };
                  }
                } else {
                  const dataModel = definitions.get(nestedData);
                  if (dataModel) {
                    if (dataModel && dataModel !== defaultValue) {
                      throw TypeError(
                        "Model instance must match the definition",
                      );
                    }
                    resultModel = nestedData;
                  } else {
                    resultModel = nestedConfig.create(nestedData);
                    sync(nestedConfig, resultModel.id, resultModel);
                  }
                }
              } else {
                resultModel = lastModel && lastModel[key];
              }

              if (resultModel) {
                const id = resultModel.id;
                Object.defineProperty(model, key, {
                  get() {
                    return cache.get(this, key, (host, cachedModel) => {
                      if (pending(host)) return cachedModel;
                      return get(defaultValue, id);
                    });
                  },
                  enumerable: true,
                });
              } else {
                model[key] = undefined;
              }
            };
          }

          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key)) {
              model[key] = nestedConfig.create(
                data[key],
                lastModel && lastModel[key],
              );
            } else {
              model[key] = lastModel ? lastModel[key] : nestedConfig.create({});
            }
          };
        }
        // eslint-disable-next-line no-fallthrough
        default: {
          const Constructor = getTypeConstructor(type);
          return (model, data, lastModel) => {
            if (hasOwnProperty.call(data, key)) {
              model[key] = Constructor(data[key]);
            } else if (lastModel && hasOwnProperty.call(lastModel, key)) {
              model[key] = lastModel[key];
            } else {
              model[key] = defaultValue;
            }
          };
        }
      }
    });

    config.create = function create(data, lastModel) {
      if (lastModel) definitions.delete(lastModel);
      if (data === null) return null;

      if (typeof data !== "object") {
        throw TypeError(`Model values must be an object: ${data}`);
      }

      const model = transform.reduce((acc, fn) => {
        fn(acc, data, lastModel);
        return acc;
      }, {});

      definitions.set(model, Model);

      return Object.freeze(model);
    };

    placeholders.add(Object.freeze(config.placeholder));
    configs.set(Model, Object.freeze(config));
  }

  return config;
}

const listErrorKeys = Object.getOwnPropertyNames(Array.prototype).filter(
  key => !(key in Error.prototype),
);

const lists = new WeakMap();
function setupListModel(Model, options = { nested: false }) {
  let config = lists.get(Model);

  if (!config) {
    const modelConfig = setupModel(Model);

    const contexts = new Set();
    contexts.add(modelConfig);

    if (!options.nested) {
      if (!modelConfig.enumerable) {
        throw TypeError("Model definition must have 'id' key set to `true`");
      }
      if (!modelConfig.storage.list) {
        throw TypeError("Model definition storage must support `list` action");
      }
    }

    config = {
      contexts,
      enumerable: modelConfig.enumerable,
      storage: setupStorage({
        cache: modelConfig.storage.cache,
        get:
          !options.nested &&
          (parameters => {
            return modelConfig.storage.list(parameters);
          }),
      }),
      placeholder: [],
      mapError: (err, id) => mapError(config, err, id, listErrorKeys),
      create(items) {
        const result = items.reduce((acc, data) => {
          let id = data;
          if (typeof data === "object" && data !== null) {
            id = data.id;
            const dataModel = definitions.get(data);
            if (dataModel) {
              if (dataModel && dataModel !== Model) {
                throw TypeError("Model instance must match the definition");
              }
            } else {
              const model = modelConfig.create(data);
              id = model.id;
              if (modelConfig.enumerable) {
                sync(modelConfig, id, model);
              } else {
                acc.push(model);
              }
            }
          } else if (!modelConfig.enumerable) {
            throw TypeError(`Model instance must be an object: ${typeof data}`);
          }
          if (modelConfig.enumerable) {
            const key = acc.length;
            Object.defineProperty(acc, key, {
              get() {
                return cache.get(this, key, (list, cachedModel) => {
                  if (pending(list)) return cachedModel;
                  return get(Model, id);
                });
              },
              enumerable: true,
            });
          }
          return acc;
        }, []);

        return Object.freeze(result);
      },
    };

    placeholders.add(Object.freeze(config.placeholder));
    lists.set(Model, Object.freeze(config));
  }

  return config;
}

function resolveTimestamp(h, v) {
  return v || getCurrentTimestamp();
}

export function get(Model, parameters) {
  const config = bootstrap(Model);
  let id;

  if (!config.storage.get) {
    throw TypeError("Model definition storage must support 'get' method");
  }

  if (config.enumerable) {
    id = stringifyParameters(parameters);
  } else if (parameters !== undefined) {
    throw TypeError(
      "Model definition must have 'id' key to support parameters",
    );
  }

  return cache.get(
    config,
    id,
    (h, cachedModel) => {
      if (
        cachedModel === config.placeholder ||
        (cachedModel && pending(cachedModel))
      ) {
        return cachedModel;
      }

      let validContexts = true;
      if (config.contexts) {
        config.contexts.forEach(context => {
          if (
            cache.get(context, context, resolveTimestamp) ===
            getCurrentTimestamp()
          ) {
            validContexts = false;
          }
        });
      }

      if (
        validContexts &&
        cachedModel &&
        cachedModel !== config.placeholder &&
        (config.storage.cache === true || config.storage.validate(cachedModel))
      ) {
        return cachedModel;
      }

      try {
        const result = config.storage.get(parameters);

        if (typeof result !== "object" || result === null) {
          throw Error(
            `Model instance with '${id}' parameters not found: ${result}`,
          );
        }

        if (result instanceof Promise) {
          result
            .then(data => {
              if (typeof data !== "object" || data === null) {
                throw Error(
                  `Model instance with '${id}' parameters not found: ${data}`,
                );
              }

              data.id = id;
              sync(config, id, config.create(data));
            })
            .catch(e => {
              sync(config, id, config.mapError(e, id));
            });

          if (cachedModel) return setPendingState(cachedModel, true);
          return config.placeholder;
        }

        return setTimestamp(config.create(result));
      } catch (e) {
        return setTimestamp(config.mapError(e, id));
      }
    },
    config.storage.validate,
  );
}

export function set(model, values = {}) {
  let Model = definitions.get(model);
  const isModelInstance = !!Model;

  Model = Model || model;

  const config = bootstrap(Model);

  if (!config.storage.set) {
    throw TypeError("Model definition storage must support 'set' method");
  }

  let id;
  let togglePending;

  try {
    if (!isModelInstance && (!values || typeof values !== "object")) {
      throw TypeError(`Values must be an object instance: ${values}`);
    }

    if (values && hasOwnProperty.call(values, "id")) {
      throw TypeError(`Values must not have 'id' property: ${values.id}`);
    }

    togglePending = value => {
      if (isModelInstance) {
        setPendingState(model, value);
      } else {
        const entry = cache.getEntry(config, id);
        if (entry.value) {
          setPendingState(entry.value, value);
        }
      }
    };

    const localModel = config.create(
      values,
      Model === model ? undefined : model,
    );

    id = (localModel && localModel.id) || model.id;

    const result = config.storage.set(
      Model === model ? undefined : id,
      localModel,
    );

    togglePending(true);

    return Promise.resolve(result)
      .then(data => {
        const resultModel = data ? config.create(data) : localModel;

        if (isModelInstance && resultModel && id !== resultModel.id) {
          throw TypeError(
            `Local and storage data must have the same id: '${id}', '${resultModel.id}'`,
          );
        }

        return sync(
          config,
          (resultModel && resultModel.id) || id,
          resultModel ||
            config.mapError(
              Error(
                `Model instance with '${id}' parameters not found: ${resultModel}`,
              ),
              id,
            ),
          true,
        );
      })
      .catch(e => {
        togglePending(false);
        throw e;
      });
  } catch (e) {
    if (togglePending) togglePending(false);
    return Promise.reject(config.mapError(e, id));
  }
}

export function clear(model, clearValue = true) {
  if (typeof model !== "object" || model === null) {
    throw TypeError(
      `The first argument must be model instance or model definition: ${model}`,
    );
  }

  if (model instanceof Error) {
    const origModel = definitions.get(model);
    if (!origModel) {
      throw TypeError(
        `The error must be connected to the model instance: ${model}`,
      );
    }
    cache.invalidate(origModel.config, origModel.id, clearValue);
  } else {
    const Model = definitions.get(model);
    if (Model) {
      cache.invalidate(bootstrap(Model), model.id, clearValue);
    } else {
      cache.invalidateAll(bootstrap(model), clearValue);
    }
  }
}

export function error(model) {
  return model instanceof Error;
}

export function ready(model) {
  return model && !error(model) && !placeholders.has(model);
}

export function pending(model) {
  return placeholders.has(model) || getPendingState(model);
}
