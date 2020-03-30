import { store } from "../../src/index.js";
import * as cache from "../../src/cache.js";
import { resolveTimeout } from "../helpers.js";

describe("store:", () => {
  let Model;

  beforeAll(() => {
    window.env = "production";
  });

  afterAll(() => {
    window.env = "development";
  });

  beforeEach(() => {
    Model = {
      id: true,
      string: "value",
      number: 1,
      bool: false,
      computed: ({ string }) => `This is the string: ${string}`,
      nestedObject: {
        value: "test",
      },
      nestedExternalObject: {
        id: true,
        value: "test",
      },
      nestedArrayOfPrimitives: ["one", "two"],
      nestedArrayOfObjects: [{ one: "two" }],
      nestedArrayOfExternalObjects: [{ id: true, value: "test" }],
    };
  });

  describe("not connected (memory based) -", () => {
    describe("get()", () => {
      it("throws for wrong arguments", () => {
        expect(() => store.get()).toThrow();
      });

      it('throws for model definition with wrongly set "id" key', () => {
        expect(() => store.get({ id: 1 })).toThrow();
      });

      it("throws if property value is not a string, number or boolean", () => {
        expect(() => store.get({ value: undefined })).toThrow();
      });

      it("throws when called with parameters for singleton type", () => {
        expect(() => store.get({}, "1")).toThrow();
      });

      it("throws when property is set as null", () => {
        expect(() => store.get({ value: null })).toThrow();
      });

      it("returns an error for not defined model", () => {
        expect(store.get({ id: true }, "1")).toBeInstanceOf(Error);
      });

      it("returns an error with guarded properties", () => {
        const model = store.get({ id: true, testValue: "", message: "" }, 1);

        expect(() => model.testValue).toThrow();
        expect(() => model.message).not.toThrow();
      });

      it("returns default model for singleton", () => {
        Model = {
          value: "test",
          nested: { value: "test", other: { value: "test" } },
        };
        expect(store.get(Model)).toEqual({
          value: "test",
          nested: { value: "test", other: { value: "test" } },
        });
      });

      describe("for created instance", () => {
        let promise;
        beforeEach(() => {
          promise = store.set(Model, {});
        });

        it("returns default values", done =>
          promise.then(model => {
            expect(model).toEqual({
              string: "value",
              number: 1,
              bool: false,
              nestedObject: {
                value: "test",
              },
              nestedExternalObject: undefined,
              nestedArrayOfPrimitives: ["one", "two"],
              nestedArrayOfObjects: [{ one: "two" }],
              nestedArrayOfExternalObjects: [],
            });
            expect(model.id).toBeDefined();
            expect(model.computed).toEqual("This is the string: value");

            done();
          }));

        it("returns cached model", done =>
          promise.then(model => {
            expect(store.get(Model, model.id)).toBe(model);
            done();
          }));
      });

      describe("for listing models", () => {
        let promise;
        beforeEach(() => {
          Model = { id: true, value: "" };
          promise = Promise.all([
            store.set(Model, { value: "one" }),
            store.set(Model, { value: "two" }),
          ]);
        });

        it("throws an error for singleton definition (without 'id' key)", () => {
          expect(() => store.get([{}])).toThrow();
        });

        it("throws an error for nested parameters", () => {
          expect(() =>
            store.get([Model], { id: "", other: { value: "test" } }),
          ).toThrow();
        });

        it("returns an error when called with parameters", () => {
          expect(store.get([Model], { a: "b" })).toBeInstanceOf(Error);
        });

        it("returns an error with guarded properties", () => {
          const model = store.get([Model], { a: "b" });

          expect(() => model.map).toThrow();
          expect(() => model.message).not.toThrow();
        });

        it("returns an array with updated models", done => {
          expect(store.get([Model])).toEqual([]);

          promise.then(() => {
            expect(store.get([Model])).toEqual([
              { value: "one" },
              { value: "two" },
            ]);
            done();
          });
        });

        it("returns the same array", () => {
          expect(store.get([Model])).toBe(store.get([Model]));
        });

        it("returns an array without deleted model", done =>
          promise
            .then(([model]) => store.set(model, null))
            .then(() => {
              expect(store.get([Model])).toEqual([{ value: "two" }]);
              done();
            }));
      });
    });

    describe("set()", () => {
      let promise;
      beforeEach(() => {
        promise = store.set(Model);
      });

      it("rejects an error when values are not an object or null", done => {
        store
          .set(Model, false)
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it("throws an error when set method is not supported", () => {
        expect(() => store.set([Model])).toThrow();
      });

      it("rejects an error when model definition is used with null", done =>
        store
          .set(Model, null)
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done));

      it("rejects an error when model definition is used with null", done =>
        promise
          .then(model => store.set(model, false))
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done));

      it("rejects an error when values contain 'id' property", done =>
        promise
          .then(model => store.set(model, model))
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done));

      it("rejects an error when array with primitives is set with wrong type", done => {
        promise
          .then(model =>
            store.set(model, {
              nestedArrayOfPrimitives: "test",
            }),
          )
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it("rejects an error when array with objects is set with wrong type", done => {
        promise
          .then(model =>
            store.set(model, {
              nestedArrayOfObjects: "test",
            }),
          )
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it("rejects an error when array with external objects is set with wrong type", done => {
        promise
          .then(model =>
            store.set(model, {
              nestedArrayOfExternalObjects: "test",
            }),
          )
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it("rejects an error when array with nested objects are set with wrong type", done => {
        promise
          .then(model =>
            store.set(model, {
              nestedArrayOfObjects: [{}, "test"],
            }),
          )
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it('creates uuid for objects with "id" key', done =>
        promise.then(model => {
          expect(model.id).toBeDefined();
          expect(model.nestedObject.id).not.toBeDefined();
          expect(model.nestedArrayOfObjects[0].id).not.toBeDefined();
          done();
        }));

      it("updates single property", done =>
        promise.then(model =>
          store.set(model, { string: "new value" }).then(newModel => {
            expect(newModel.string).toBe("new value");
            expect(newModel.number).toBe(1);
            expect(newModel.bool).toBe(false);
            expect(newModel.nestedObject).toBe(model.nestedObject);
            expect(newModel.nestedArrayOfObjects).toBe(
              newModel.nestedArrayOfObjects,
            );
            expect(newModel.nestedArrayOfPrimitives).toBe(
              newModel.nestedArrayOfPrimitives,
            );
            done();
          }),
        ));

      it("updates nested object", done =>
        promise.then(model =>
          store
            .set(model, { nestedObject: { value: "other" } })
            .then(newModel => {
              expect(newModel.nestedObject).toEqual({ value: "other" });
              done();
            }),
        ));

      it("rejects an error when updates nested object with different model", done =>
        promise.then(model =>
          store
            .set({ test: "value" })
            .then(otherModel =>
              store.set(model, { nestedExternalObject: otherModel }),
            )
            .catch(e => e)
            .then(e => expect(e).toBeInstanceOf(Error))
            .then(done),
        ));

      it("updates nested external object with proper model", done =>
        promise.then(model =>
          store.set(Model.nestedExternalObject, {}).then(newExternal =>
            store
              .set(model, { nestedExternalObject: newExternal })
              .then(newModel => {
                expect(newModel).not.toBe(model);
                expect(newModel.nestedExternalObject).toBe(newExternal);
                done();
              }),
          ),
        ));

      it("updates nested external object with data", done =>
        promise.then(model =>
          store
            .set(model, { nestedExternalObject: { value: "one", a: "b" } })
            .then(newModel => {
              expect(newModel).not.toBe(model);
              expect(newModel.nestedExternalObject).toEqual({ value: "one" });
              done();
            }),
        ));

      it("updates nested external object with model id", done =>
        promise.then(model =>
          store.set(Model.nestedExternalObject, {}).then(newExternal =>
            store
              .set(model, { nestedExternalObject: newExternal.id })
              .then(newModel => {
                expect(newModel).not.toBe(model);
                expect(newModel.nestedExternalObject).toBe(newExternal);
                done();
              }),
          ),
        ));

      it("clears nested external object", done =>
        promise.then(model =>
          store
            .set(model, { nestedExternalObject: null })
            .then(newModel => {
              expect(newModel).not.toBe(model);
              expect(newModel.nestedExternalObject).toBe(undefined);
            })
            .then(done),
        ));

      it("updates nested array of primitives", done =>
        promise.then(model =>
          store
            .set(model, { nestedArrayOfPrimitives: [1, 2, 3] })
            .then(newModel => {
              expect(newModel.nestedArrayOfPrimitives).toEqual(["1", "2", "3"]);
              done();
            }),
        ));

      it("create model with nested array of objects", done => {
        store
          .set(Model, {
            nestedArrayOfObjects: [
              { one: "two" },
              { two: "three", one: "four" },
            ],
          })
          .then(model => {
            expect(model.nestedArrayOfObjects).toEqual([
              { one: "two" },
              { one: "four" },
            ]);
            done();
          });
      });

      it("updates nested array of objects", done =>
        promise.then(model =>
          store
            .set(model, { nestedArrayOfObjects: [{ one: "three" }] })
            .then(newModel => {
              expect(newModel.nestedArrayOfObjects).toEqual([{ one: "three" }]);
              done();
            }),
        ));

      it("rejects an error when model in nested array does not match model", done => {
        store
          .set({ myValue: "text" })
          .then(model =>
            store.set(Model, {
              nestedArrayOfExternalObjects: [model],
            }),
          )
          .catch(e => e)
          .then(e => expect(e).toBeInstanceOf(Error))
          .then(done);
      });

      it("creates model with nested external object from raw data", done => {
        store
          .set(Model, {
            nestedArrayOfExternalObjects: [{ id: "1", value: "1" }],
          })
          .then(model => {
            expect(model.nestedArrayOfExternalObjects[0].id).toEqual("1");
            expect(model.nestedArrayOfExternalObjects).toEqual([
              { value: "1" },
            ]);
            done();
          });
      });

      it("creates model with nested external object from model instance", done => {
        store.set(Model.nestedArrayOfExternalObjects[0]).then(nestedModel =>
          store
            .set(Model, {
              nestedArrayOfExternalObjects: [nestedModel],
            })
            .then(model => {
              expect(model.nestedArrayOfExternalObjects[0]).toBe(nestedModel);
              done();
            }),
        );
      });

      it("deletes model", done =>
        promise.then(model =>
          store.set(model, null).then(() => {
            expect(store.get(Model, model.id)).toBeInstanceOf(Error);
            done();
          }),
        ));
    });

    describe("clear()", () => {
      let promise;
      beforeEach(() => {
        promise = store.set(Model, { string: "test" });
      });

      it("throws when clear not a model instance or model definition", () => {
        expect(() => store.clear()).toThrow();
        expect(() => store.clear("string")).toThrow();
      });

      it("throws when first argument is error not connected to model instance", () => {
        expect(() => store.clear(Error("Some error"))).toThrow();
      });

      it("removes model instance by reference", done => {
        promise
          .then(model => {
            store.clear(model);
            expect(store.get(Model, model.id)).toBeInstanceOf(Error);
          })
          .then(done);
      });

      it("removes model instance by id", done => {
        promise
          .then(model => {
            store.clear(Model, model.id);
            expect(store.get(Model, model.id)).toBeInstanceOf(Error);
          })
          .then(done);
      });

      it("removes model by thrown error", () => {
        const modelError = store.get(Model, 1);
        store.clear(modelError);
        expect(store.get(Model, 1)).not.toBe(modelError);
      });

      it("removes all model instances by definition", done => {
        promise
          .then(model => {
            store.clear(Model);
            expect(store.get(Model, model.id)).toBeInstanceOf(Error);
          })
          .then(done);
      });

      it("only invalidates with clearValue option set to false", done => {
        promise.then(model => {
          const spy = jasmine.createSpy();
          const unobserve = cache.observe(
            {},
            "key",
            () => {
              spy();
              return store.get(Model, model.id);
            },
            () => {},
          );

          requestAnimationFrame(() => {
            expect(spy).toHaveBeenCalledTimes(1);
            store.clear(model, false);

            requestAnimationFrame(() => {
              expect(spy).toHaveBeenCalledTimes(2);
              expect(store.get(Model, model.id)).toBe(model);

              unobserve();
              done();
            });
          });
        });
      });
    });
  });

  describe("connected to sync storage -", () => {
    let storage;
    beforeEach(() => {
      storage = {
        1: { id: "1", value: "test" },
        2: { id: "2", value: "other" },
      };

      Model = {
        id: true,
        value: "",
        [store.connect]: {
          get: id => storage[id],
          set: (id, values) => {
            if (values) {
              storage[id || values.id] = values;
            } else {
              delete storage[id];
            }
          },
          list: () => Object.values(storage),
        },
      };
    });

    it("throws an error when get method is not defined", () => {
      Model = { id: true, [store.connect]: {} };
      expect(() => store.get(Model, "1")).toThrow();
    });

    it("throws an error for listing model when list method is not defined", () => {
      Model = { id: true, [store.connect]: { get: () => {} } };
      expect(() => store.get([Model])).toThrow();
    });

    it("throws when cache is set with wrong type", () => {
      expect(() =>
        store.get({ value: "test", [store.connect]: { cache: "lifetime" } }),
      ).toThrow();
    });

    it("returns an error when id does not match", done => {
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          get: id => storage[id],
          set: (id, values) => {
            return { ...values, id: parseInt(id, 10) + 1 };
          },
        },
      };

      const model = store.get(Model, 1);
      store
        .set(model, { value: "test" })
        .catch(e => e)
        .then(e => expect(e).toBeInstanceOf(Error))
        .then(done);
    });

    it("returns an error instance when get action throws", () => {
      storage = null;
      const model = store.get(Model, 1);
      expect(model).toBeInstanceOf(Error);
      expect(store.get(Model, 1)).toBe(model);
    });

    it("does not cache set action when it rejects an error", done => {
      const origStorage = storage;
      storage = null;
      store
        .set(Model, { value: "other" })
        .catch(() => {
          storage = origStorage;
          expect(store.get(Model, 1)).toEqual({ value: "test" });
        })
        .then(done);
    });

    it("returns a promise rejecting an error instance when set throws", done => {
      storage = null;
      store
        .set(Model, { value: "test" })
        .catch(e => {
          expect(e).toBeInstanceOf(Error);
        })
        .then(done);
    });

    it("returns an error instance when get throws primitive value", () => {
      Model = {
        id: true,
        [store.connect]: () => {
          throw Promise.resolve();
        },
      };
      expect(store.get(Model, 1)).toBeInstanceOf(Error);
    });

    it("returns an error for not existing model", () => {
      expect(store.get(Model, 0)).toBeInstanceOf(Error);
    });

    it("returns model from the storage", () => {
      expect(store.get(Model, 1)).toEqual({ value: "test" });
    });

    it("returns the same model for string or number id", () => {
      expect(store.get(Model, "1")).toBe(store.get(Model, 1));
    });

    it("returns a list of models", () => {
      expect(store.get([Model])).toEqual([
        { value: "test" },
        { value: "other" },
      ]);
    });

    it("adds item to list of models", done => {
      expect(store.get([Model]).length).toBe(2);
      store.set(Model, { value: "new value" }).then(model => {
        const list = store.get([Model]);
        expect(list.length).toBe(3);
        expect(list[2]).toBe(model);
        done();
      });
    });

    it("removes item form list of models", done => {
      store.set(store.get([Model])[0], null).then(() => {
        const list = store.get([Model]);
        expect(list.length).toBe(1);
        done();
      });
    });

    it("returns the same list when modifies already existing item", done => {
      const list = store.get([Model]);
      store.set(list[0], { value: "new value" }).then(() => {
        expect(store.get([Model])).toBe(list);
        done();
      });
    });

    it("calls observed properties once", done => {
      const spy = jasmine.createSpy("observe callback");
      const getter = () => store.get([Model]);
      const unobserve = cache.observe({}, "key", getter, spy);

      resolveTimeout(() => {
        expect(spy).toHaveBeenCalledTimes(1);
        unobserve();
      }).then(done);
    });

    it("set states for model instance", () => {
      const model = store.get(Model, 1);
      expect(store.pending(model)).toBe(false);
      expect(store.ready(model)).toBe(true);
      expect(store.error(model)).toBe(false);
    });

    it("for cache set to 'false' calls storage each time", done => {
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: false,
          get: id => storage[id],
        },
      };

      const model = store.get(Model, 1);
      expect(model).toEqual({ value: "test" });

      expect(model).toBe(store.get(Model, 1));
      expect(model).toBe(store.get(Model, 1));

      resolveTimeout(() => {
        expect(model).not.toBe(store.get(Model, 1));
        done();
      });
    });

    it("for cache set to 'false' does not call get for single item", done => {
      const spy = jasmine.createSpy("get");
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: false,
          get: id => {
            spy(id);
            return storage[id];
          },
          list: () => Object.values(storage),
        },
      };

      const model = store.get([Model]);
      requestAnimationFrame(() => {
        expect(model[0]).toEqual({ value: "test" });
        expect(spy).toHaveBeenCalledTimes(0);
        done();
      });
    });

    it("for cache set to number get calls storage after timeout", done => {
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: 100,
          get: id => storage[id],
        },
      };

      const model = store.get(Model, 1);
      expect(model).toEqual({ value: "test" });
      expect(model).toBe(store.get(Model, 1));

      resolveTimeout(() => {
        expect(model).not.toBe(store.get(Model, 1));
      }).then(done);
    });

    it("uses id returned from set action", done => {
      let count = 2;
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          get: id => storage[id],
          set: (id, values) => {
            if (!id) {
              id = count + 1;
              count += 1;
              values = { id, ...values };
            }
            storage[id] = values;
            return values;
          },
        },
      };

      store
        .set(Model, { value: "test" })
        .then(model => {
          expect(store.get(Model, "3")).toBe(model);
        })
        .then(done);
    });

    it("clear forces call for model again", done => {
      const model = store.get(Model, 1);
      store.clear(model);
      requestAnimationFrame(() => {
        expect(store.get(Model, 1)).not.toBe(model);
        done();
      });
    });

    describe("with nested array options", () => {
      const setupDep = options => {
        return {
          items: [Model, options],
          [store.connect]: () => ({ items: Object.values(storage) }),
        };
      };

      it("throws an error when options are set with wrong type", () => {
        expect(() => store.get({ items: [Model, true] })).toThrow();
      });

      it("returns updated list when loose option is set", done => {
        const DepModel = setupDep({ loose: true });
        const model = store.get(Model, 1);

        const list = store.get(DepModel);
        expect(list.items.length).toBe(2);

        store
          .set(model, null)
          .then(() => {
            const newList = store.get(DepModel);
            expect(newList.items.length).toBe(1);
          })
          .then(done);
      });

      it("returns the same list if loose options are not set", done => {
        const DepModel = setupDep();
        const model = store.get(Model, 1);

        const list = store.get(DepModel);
        expect(list.items.length).toBe(2);

        store
          .set(model, null)
          .then(() => {
            const newList = store.get(DepModel);
            expect(newList.items[0]).toBeInstanceOf(Error);
            expect(newList.items.length).toBe(2);
          })
          .then(done);
      });

      it("returns the same list if loose options are not set", done => {
        const DepModel = setupDep({ loose: false });
        const model = store.get(Model, 1);

        const list = store.get(DepModel);
        expect(list.items.length).toBe(2);

        store
          .set(model, null)
          .then(() => {
            const newList = store.get(DepModel);
            expect(newList.items[0]).toBeInstanceOf(Error);
            expect(newList.items.length).toBe(2);
          })
          .then(done);
      });

      it("returns updated list if one of many loose arrays changes", done => {
        const otherStorage = {
          "1": { id: "1", value: "test" },
        };
        const NewModel = {
          id: true,
          value: "",
          [store.connect]: {
            get: id => otherStorage[id],
            set: (id, values) => {
              if (values === null) {
                delete otherStorage[id];
              } else {
                otherStorage[id] = values;
              }
            },
          },
        };

        const DepModel = {
          items: [Model, { loose: true }],
          otherItems: [NewModel, { loose: true }],
          [store.connect]: () => ({
            items: Object.values(storage),
            otherItems: Object.values(otherStorage),
          }),
        };

        const list = store.get(DepModel);
        store.set(list.otherItems[0], null);

        requestAnimationFrame(() => {
          const newList = store.get(DepModel);
          expect(newList.otherItems.length).toBe(0);
          done();
        });
      });
    });
  });

  describe("connected to async storage -", () => {
    let fn;
    beforeEach(() => {
      fn = id => Promise.resolve({ id, value: "true" });
      Model = {
        id: true,
        value: "",
        [store.connect]: id => fn(id),
      };
    });

    it("rejects an error when promise resolves with other type than object", done => {
      fn = () => {
        return Promise.resolve("value");
      };

      store.get(Model, 1);

      Promise.resolve()
        .then(() => {})
        .then(() => {
          const model = store.get(Model, 1);
          expect(model).toBeInstanceOf(Error);
        })
        .then(done);
    });

    it("returns placeholder object in pending state", () => {
      const placeholder = store.get(Model, 1);
      expect(placeholder).toBeInstanceOf(Object);
      expect(() => placeholder.value).toThrow();
    });

    it("calls storage get action once for permanent cache", () => {
      const spy = jasmine.createSpy();
      fn = id => {
        spy(id);
        return Promise.resolve({ id, value: "test" });
      };
      store.get(Model, 1);
      store.get(Model, 1);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("calls storage get action once for time-based cache", () => {
      const spy = jasmine.createSpy();
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: 100,
          get: id => {
            spy(id);
            return Promise.resolve({ id, value: "test" });
          },
        },
      };

      store.get(Model, 1);
      store.get(Model, 1);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("calls observe method twice (pending & ready states)", done => {
      const spy = jasmine.createSpy();
      cache.observe({}, "key", () => store.get(Model, "1"), spy);

      resolveTimeout(() => {
        expect(spy).toHaveBeenCalledTimes(2);
      }).then(done);
    });

    it("returns cached external nested object in pending state", done => {
      Model = {
        id: true,
        value: "",
        nestedExternalObject: {
          id: true,
          value: "test",
          [store.connect]: {
            cache: false,
            get: id => Promise.resolve({ id, value: "one" }),
          },
        },
        [store.connect]: {
          cache: false,
          get: id =>
            Promise.resolve({
              id,
              value: "test",
              nestedExternalObject: "1",
            }),
        },
      };

      store.get(Model, 1);

      setTimeout(() => {
        const model = store.get(Model, 1);
        const nestedModel = model.nestedExternalObject;
        setTimeout(() => {
          const resolvedNestedModel = model.nestedExternalObject;
          expect(resolvedNestedModel).not.toBe(nestedModel);

          requestAnimationFrame(() => {
            const newModel = store.get(Model, 1);
            expect(newModel).toBe(model);
            expect(newModel.nestedExternalObject).toBe(resolvedNestedModel);
            done();
          });
        });
      });
    });

    it("returns cached list in pending state", done => {
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: false,
          get: id =>
            Promise.resolve({
              id,
              value: "test",
            }),
          list: () => Promise.resolve(["1"]),
        },
      };

      store.get([Model]);

      requestAnimationFrame(() => {
        const models = store.get([Model]);
        const model = models[0];
        requestAnimationFrame(() => {
          const resolvedModel = models[0];
          expect(resolvedModel).not.toBe(model);

          requestAnimationFrame(() => {
            const newModels = store.get([Model]);
            expect(newModels).toBe(models);
            expect(newModels[0]).toBe(resolvedModel);
            done();
          });
        });
      });
    });

    it("returns placeholder in async calls for long fetching model", done => {
      let resolvePromise;
      Model = {
        id: true,
        value: "",
        [store.connect]: {
          cache: false,
          get: id =>
            new Promise(resolve => {
              resolvePromise = () => resolve({ id, value: "test" });
            }),
        },
      };

      const pendingModel = store.get(Model, 1);
      expect(store.pending(pendingModel)).toBe(true);
      expect(() => pendingModel.value).toThrow();

      let resolvedModel;
      requestAnimationFrame(() => {
        resolvedModel = store.get(Model, 1);
        expect(store.pending(resolvedModel)).toBe(true);

        requestAnimationFrame(() => {
          resolvedModel = store.get(Model, 1);
          expect(store.pending(resolvedModel)).toBe(true);

          resolvePromise();
          Promise.resolve().then(() => {
            resolvedModel = store.get(Model, 1);
            expect(store.pending(resolvedModel)).toBe(false);

            requestAnimationFrame(() => {
              resolvedModel = store.get(Model, 1);
              expect(store.pending(resolvedModel)).toBe(true);
              done();
            });
          });
        });
      });
    });

    describe("for success", () => {
      it("sets pending state", done => {
        expect(store.pending(store.get(Model, 1))).toBe(true);

        Promise.resolve()
          .then(() => {
            expect(store.pending(store.get(Model, 1))).toBe(false);
          })
          .then(done);
      });

      it("sets ready state", done => {
        expect(store.ready(store.get(Model, 1))).toBe(false);

        Promise.resolve()
          .then(() => {
            expect(store.ready(store.get(Model, 1))).toBe(true);
          })
          .then(done);
      });

      it("sets error state", done => {
        expect(store.error(store.get(Model, 1))).toBe(false);

        Promise.resolve()
          .then(() => {
            expect(store.error(store.get(Model, 1))).toBe(false);
          })
          .then(done);
      });
    });

    describe("for error", () => {
      beforeEach(() => {
        fn = () => Promise.reject(Error("some error"));
      });

      it("caches an error result", done => {
        store.get(Model, 1);
        Promise.resolve()
          .then(() => {})
          .then(() => {
            expect(store.get(Model, 1)).toBe(store.get(Model, 1));
          })
          .then(done);
      });

      it("sets pending state", done => {
        expect(store.pending(store.get(Model, 1))).toBe(true);

        Promise.resolve()
          .then(() => {})
          .then(() => {
            expect(store.pending(store.get(Model, 1))).toBe(false);
          })
          .then(done);
      });

      it("sets ready state", done => {
        expect(store.ready(store.get(Model, 1))).toBe(false);

        Promise.resolve()
          .then(() => {})
          .then(() => {
            expect(store.ready(store.get(Model, 1))).toBe(false);
          })
          .then(done);
      });

      it("sets error state", done => {
        expect(store.error(store.get(Model, 1))).toBe(false);

        Promise.resolve()
          .then(() => {})
          .then(() => {
            expect(store.error(store.get(Model, 1))).toBe(true);
          })
          .then(done);
      });

      it("sets pending state for singleton", done => {
        Model = {
          value: "test",
          [store.connect]: {
            get: (id, values) => Promise.reject(values),
            set: (id, values) => Promise.reject(values),
          },
        };

        store.get(Model);

        Promise.resolve()
          .then(() => {})
          .then(() => {
            const model = store.get(Model);
            expect(store.error(model)).toBe(true);

            store.set(Model, { value: "other" });
            const nextModel = store.get(Model);
            expect(store.pending(nextModel)).toBe(true);
            return Promise.resolve()
              .then(() => {})
              .then(() => {
                expect(store.pending(nextModel)).toBe(false);
              });
          })
          .then(done);
      });
    });
  });
});
