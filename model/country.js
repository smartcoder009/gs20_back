const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let countrySchema = new Schema({
  "country_name": String,
  "country_code": String,
  "currency_code": String,
  "status": Number,
  "btcPrice": Number
}, {"versionKey" : false});

module.exports = mongoose.model('country', countrySchema, 'country');
