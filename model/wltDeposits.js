const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let wltDeposits = new Schema({
  "amount"        : String,
  "txnid"         : String,
  "currency"      : String,
  "created_at"    : { type:Date, default:Date.now },
}, {"versionKey" : false});

module.exports = mongoose.model('wltDeposits', wltDeposits, 'wltDeposits');