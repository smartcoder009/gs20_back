const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let tradeSchema = new Schema({
  "userId" : {type: mongoose.Schema.Types.ObjectId, ref: 'users'},
  "ip" : String,
  "firstCurrency" : { type: mongoose.Schema.Types.ObjectId, ref: 'currency'},
  "secondCurrency" : { type: mongoose.Schema.Types.ObjectId, ref: 'currency'},  
  "Amount" : { type: Number, default: 0 },
  "Price"  : { type: Number, default: 0 },
  "Type"   : String,        //buy or sell
  "ordertype" : { type: String }, // limit, instant,stop
  "Fee"    : { type: Number, default: 0 },
  "Total"  : { type: Number, default: 0 },
  "datetime" : { type: Date, default: Date.now },
  "pair"   : { type: mongoose.Schema.Types.ObjectId, ref: 'pairs'},
  "pairSymbol" : { type: String, default: '' }, 
  "status" : String, //active,filled,cancelled
  "stoporderprice" :  { type: Number, default: 0 },
  "modifiedDate": { type: Date, default: Date.now } 
}, {"versionKey" : false});

module.exports = mongoose.model('trade', tradeSchema);