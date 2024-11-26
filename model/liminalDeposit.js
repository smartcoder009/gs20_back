const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let liminalSchema = new Schema({
  "txid"  : String,
  "amount"  : Number,
  "coin"  : String,
  "network"  : String,
  "address"  : String,
  "tag"  : String,
  "contract"  : String,
  "status" : {type: Number, default: 0}, 
  "createdDate": { type: Date, default: Date.now }, 
  "modifiedDate": { type: Date, default: Date.now },
}, {"versionKey" : false});

module.exports = mongoose.model('liminal_deposit', liminalSchema,'liminal_deposit');
