export function createStorage(namespace) {
  return {
    get(id) {
      return namespace.get(id, "json");
    },

    put(id, data, options) {
      return namespace.put(id, JSON.stringify(data), options);
    },

    delete(id) {
      return namespace.delete(id);
    },
  };
}
