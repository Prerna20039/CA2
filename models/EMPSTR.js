const mongoose = require('mongoose');

const EMPSTRSchema = new mongoose.Schema({
    employeeCode: String,
    hodId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'HOD', // Reference to HOD model if applicable
        required: true
    },
    dateOfRequest: { type: Date, default: Date.now },
    requisitionerName: String,
    department: String,
    itemDescription: String,
    quantity: Number,
    status: { type: String, default: 'pending' },
    decision: { type: String, default: null }
});

module.exports = mongoose.model('EMPSTR', EMPSTRSchema);
