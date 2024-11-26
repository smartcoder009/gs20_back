const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let contactusSchema = new Schema({
  "name"      : String,
  "emailid"   : String,
  "message"   : String,
  "subject"   :String,
  "reply"     : String,
  "status"    : { type: Number, default: 0 }, // 0-pending, 1- reply
  "created_at": { type: Date, default: Date.now },
  "updated_at": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('contactus', contactusSchema,'contactus');