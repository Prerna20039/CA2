const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const UserSchema = new Schema({
    name: String,
    password: String,
    role: {
        type: String,
        enum: ['admin', 'hod', 'driver', 'employee','Dhod'],
        required: true
    },
    department: String,
    userId: {
        type: String, // Adjust type if longer IDs are acceptable
        required: true,
        maxlength: 64 // Example max length
    },
    hodId: {
        type: Schema.Types.ObjectId, // Ensure this is an ObjectId
        ref: 'User', // Assuming you have a 'User' model
        required: false // or true if required
    },
});

module.exports = mongoose.model('User', UserSchema);
