const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let coindetailsSchema = new Schema({
  "details"          : String, 
  "created_at"       : {type: Date, default: Date.now }, 
  "currency_id"      : {type: mongoose.Schema.Types.ObjectId, ref: 'currency'},
  "updated_at"       : {type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('coindetails', coindetailsSchema, 'coindetails');