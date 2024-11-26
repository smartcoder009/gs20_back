const mongoose = require('mongoose');
const Schema = mongoose.Schema;

let orderSchema = new Schema({
  "orderId"      : {type:String, index:true},
  "order"      : {type:String, index:true},
  "status"     : {type:Number, default:0 },
  "created_at" : {type: Date, default: Date.now },
  "updated_at" : {type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('bin_orders', orderSchema, 'bin_orders');