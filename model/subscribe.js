const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let subscribeSchema = new Schema({
  "email"         : { type: String, unique: true },
  "status"        : { type: Number, default: 0 },
  "createdDate"   : { type: Date, default: Date.now }, 
  "modifiedDate"  : { type: Date, default: Date.now },
}, {"versionKey"  : false});

module.exports = mongoose.model('subscribe', subscribeSchema,'subscribe');