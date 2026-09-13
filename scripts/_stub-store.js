class Store {
  constructor() {
    this.data = {}
  }
  get(k, d) {
    return this.data[k] === undefined ? d : this.data[k]
  }
  set(k, v) {
    this.data[k] = v
  }
}
module.exports = Store
module.exports.default = Store
