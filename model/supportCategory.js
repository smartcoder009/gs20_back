const mongoose  = require('mongoose')
const Schema = mongoose.Schema;

let HelpSchema = new Schema({
  "category" : String,
  "status": { type: Number, default: 1 },
  "created_at": { type: Date, default: Date.now }
}, {"versionKey" : false});

module.exports = mongoose.model('help_issues', HelpSchema, 'help_issues');