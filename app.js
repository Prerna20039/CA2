const express = require('express');
const mongoose = require('mongoose');
const userRoutes = require('./routes/userRoutes');
const User = require('./models/User');
const Request = require('./models/Request');
const EMPTRF = require('./models/EMPTRF');
const EMPSTR = require('./models/EMPSTR');
const HODTRF = require('./models/HODTRF');
const bodyParser = require('body-parser');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
require('dotenv').config();


const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = process.env.PORT || 3000;

// Set view engine
app.set('view engine', 'ejs');
app.set('views', './views');

// Middleware for parsing request body
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Set up session
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key', // Change this to a secure random value
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.COOKIE_SECURE || false } // Set to true if using HTTPS
}));

// Use the user router
app.use('/api/users', userRoutes);

// Render home page
app.get('/', (req, res) => {
    res.render('index');
});

// View form to HOD
app.get('/hod/driverForm', (req, res) => {
    res.render('driverForm');
});

// Route to handle form submission
app.post('/saveBooking', (req, res) => {
    const { distance, tollUsage } = req.body;
    res.redirect('/driver/dashboard');
});

// Update form
app.post('/api/driver/updateBooking', async (req, res) => {
    const { bookingId, distanceTraveled, tollUsage } = req.body;

    try {
        const booking = await Request.findById(bookingId);
        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        booking.distanceTraveled = distanceTraveled;
        booking.tollUsage = tollUsage;

        await booking.save();
        res.status(200).send('Booking updated successfully');
    } catch (err) {
        res.status(500).send('Server error');
    }
});

// Show driver history
app.get('/driver/history', async (req, res) => {
    if (req.session.user && req.session.user.role === 'driver') {
        try {
            const bookings = await Request.find({ driverId: req.session.user.driverId });
            res.render('driverHistory', { bookings });
        } catch (err) {
            res.status(500).send('Server error');
        }
    } else {
        res.redirect('/');
    }
});



// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        console.log('MongoDB connected');

        // Check if the admin user already exists
        const existingAdmin = await User.findOne({ userId: 'admin' });
        if (!existingAdmin) {
            // Create admin user if not exists
            const adminUser = new User({
                userId: 'admin',
                name: 'Admin',
                role: 'admin',
                department: 'Administration',
                password: '123', // Store the password as plain text (not recommended for production)
            });

            await adminUser.save();
            console.log('Admin user created');

        } else {
            console.log('Admin user already exists');
        }
    })
    .catch(err => console.log('MongoDB connection error:', err));


// Start the server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});




// Login route
app.post('/api/login', async (req, res) => {
    const { userId, password } = req.body;
    const user = await User.findOne({ userId });

    if (user && user.password === password) {
        req.session.user = {
            _id: user._id,
            userId: user.userId,
            role: user.role,
            name: user.name
        };

        // Redirect based on role
        switch (user.role) {
            case 'admin':
                return res.redirect('/admin/dashboard');
            case 'driver':
                return res.redirect('/driver/dashboard');
            case 'hod':
                return res.redirect('/hod/dashboard');
            case 'employee':
                return res.redirect('/employee/dashboard');
            case 'Dhod':
                return res.redirect('/driverHOD/dashboard');
            default:
                res.status(401).send('Invalid role');
        }
    } else {
        res.status(401).send('Invalid credentials');
    }
});



// Render driver form with pre-filled driverId
app.get('/driver/form/:driverId', (req, res) => {
    const driverId = req.params.driverId;
    res.render('driverForm', { driverId });
});
// HOD dashboard route
io.on('connection', (socket) => {
    socket.on('disconnect', () => {
    });
});
// routes.js or app.js (where your routes are defined)
app.post('/hod/decision/:id', async (req, res) => {
    if (req.session.user && req.session.user.role === 'hod') {
        try {
            const { decision } = req.body;
            await EMPTRF.findByIdAndUpdate(req.params.id, { decision, status: decision });
            res.redirect('/hod/dashboard');
        } catch (error) {
            res.redirect('/hod/dashboard');
        }
    } else {
        res.redirect('/');
    }
});

// FORM to show to employee 
app.get('/employee/travel-request-form', async (req, res) => {
    if (req.session.user && req.session.user.role === 'employee') {
        try {
            // Fetch the user details, including the assigned HOD
            const user = await User.findById(req.session.user._id).populate('hodId');
            if (!user) {
                return res.status(404).send('User not found');
            }

            // Render the form and pass the user data
            res.render('em_TRF', {
                user: {
                    userId: user.userId,
                    hodId: user.hodId ? user.hodId._id : '' // Ensure HOD ID is populated correctly
                }
            });
        } catch (error) {
            console.error('Error fetching user or rendering form:', error); // Log the error for debugging
            res.status(500).send('Server Error');
        }
    } else {
        res.redirect('/login'); // Redirect to login if user is not authenticated
    }
});

// Save HOD form to driver in MongoDB
app.post('/api/users/hod/bookings', async (req, res) => {
    try {
        const { driverId, hodId, ...bookingData } = req.body;

        // Ensure the required fields are present
        if (!driverId) {
            return res.status(400).send('Missing required fields');
        }

        const newBooking = new Request({
            ...bookingData,
            driverId,
            hodId
        });

        await newBooking.save();
        res.status(201).send('Booking saved successfully');
    } catch (err) {
        res.status(500).send('Server error');
    }
});

app.get('/admin/dashboard', async (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        let query = {};

        // Check for startDate and endDate in request query parameters
        const { startDate, endDate } = req.query;

        if (startDate && endDate) {
            query.dateOfRequest = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            query.dateOfRequest = {
                $gte: today,
                $lt: tomorrow
            };
        }

        try {
            const hodtrfs = await HODTRF.find(query);

            res.render('adminDashboard', {
                user: req.session.user,
                hodtrfs,
                formCount: hodtrfs.length
            });
        } catch (error) {
            res.render('adminDashboard', {
                user: req.session.user,
                hodtrfs: [],
                formCount: 0
            });
        }
    } else {
        res.redirect('/');
    }
});


// Endpoint to update the decision of a form by ID
app.post('/api/HOD/TRF/:id/decision', async (req, res) => {
    const { id } = req.params;
    const { decision } = req.body;

    try {
        const updatedForm = await HODTRF.findByIdAndUpdate(id, { decision: decision }, { new: true });
        res.json({ message: 'Form decision updated successfully', form: updatedForm });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/admin/decision/:id', async (req, res) => {
    if (req.session.user && req.session.user.role === 'admin') {
        try {
            const { decision } = req.body;
            await HODTRF.findByIdAndUpdate(req.params.id, { decision, status: decision });
            res.redirect('/admin/dashboard');
        } catch (error) {
            res.redirect('/admin/dashboard');
        }
    } else {
        res.redirect('/');
    }
});

// Handle form submission and save to database
app.post('/api/HOD/ADMIN/TRF', async (req, res) => {
    try {
        const HODTOADMIN = new HODTRF(req.body); // Use HODTRF model
        await HODTOADMIN.save(); // Save to HODTRF collection
        res.status(201).send('TRF Req Send'); // Success message
    } catch (err) {
        res.status(500).send('Server error'); // Error message
    }
});
app.get('/admin/hodtrfs', async (req, res) => {
    try {
        const hodtrfs = await HODTRF.find(); // Fetch all HODTRF records
        res.render('hodtrfs-list', { HODTRF: hodtrfs }); // Pass data to EJS template
    } catch (err) {
        res.status(500).send('Server error');
    }
});
app.get('/hod/TRF_ADMIN', async (req, res) => {
    if (req.session.user && req.session.user.role === 'hod') {
        res.render('hod_trf', {
            user: req.session.user,
        });
    } else {
        res.redirect('/');
    }
});

app.post('/add', async (req, res) => {
    const { userId, name, role, department, password, hodId } = req.body;

    console.log('Received hodId:', hodId); // Debug line to check hodId format

    // Validate required fields
    if (!userId || !name || !role || !department || !password) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Convert hodId to ObjectId if role is 'employee'
    let hodIdObj = null;
    if (role === 'employee' && hodId) {
        try {
            hodIdObj = mongoose.Types.ObjectId(hodId);
        } catch (err) {
            return res.status(400).json({ message: 'Invalid HOD ID format' });
        }
    }

    const user = new User({
        userId,
        name,
        role,
        department,
        password, // Store password as is (not recommended for production)
        hodId: role === 'employee' ? hodIdObj : null // Set hodId if role is 'employee'
    });

    try {
        await user.save();
        res.redirect('/api/users/list'); // Redirect on successful save
    } catch (err) {
        res.status(400).json({ message: 'Error creating user', error: err });
    }
});

app.post('/api/users/add', async (req, res) => {
    const { userId, name, role, department, password, hodId } = req.body;

    // Validate required fields
    if (!userId || !name || !role || !department || !password) {
        return res.status(400).json({ message: 'Missing required fields' });
    }

    // Validate and convert hodId if role is 'employee'
    let validatedHodId = null;
    if (role === 'employee') {
        if (hodId) {
            if (mongoose.isValidObjectId(hodId)) {
                validatedHodId = new mongoose.Types.ObjectId(hodId); // Use 'new' keyword
            } else {
                return res.status(400).json({ message: 'Invalid HOD ID format' });
            }
        } else {
            return res.status(400).json({ message: 'HOD ID is required for employee role' });
        }
    }

    const user = new User({
        userId,
        name,
        role,
        department,
        password, // Store password as is (not recommended for production)
        hodId: role === 'employee' ? validatedHodId : null // Set hodId if role is 'employee'
    });

    try {
        await user.save();
        res.redirect('/api/users/list'); // Redirect on successful save
    } catch (err) {
        res.status(400).json({ message: 'Error creating user', error: err });
    }
});
// Example Express route to get HODs
app.get('/api/hods', async (req, res) => {
    try {
        const hods = await User.find({ role: 'hod' }, 'userId name'); // Adjust query as needed
        res.json(hods);
    } catch (error) {
        console.error('Error fetching HODs:', error);
        res.status(500).json({ message: 'Error fetching HODs' });
    }
});


app.get('/createUser', async (req, res) => {
    try {
        const hods = await User.find({ role: 'hod' }).select('userId name _id'); // Ensure proper fields are selected
        res.render('createUser', { hods });
    } catch (err) {
        console.error('Error fetching HODs:', err);
        res.status(500).send('Server Error');
    }
});


app.get('/api/users/list', async (req, res) => {
    try {
        const users = await User.find().populate('hodId');
        const hods = await User.find({ role: 'hod' });
        const adminCount = await User.countDocuments({ role: 'admin' });
        const hodCount = await User.countDocuments({ role: 'hod' });
        const driverCount = await User.countDocuments({ role: 'driver' });
        const employeeCount = await User.countDocuments({ role: 'employee' });
        const DhodCount = await User.countDocuments({ role: 'Dhod' });

        res.render('userList', {
            users,
            adminCount,
            hodCount,
            driverCount,
            employeeCount,
            hods // Ensure hods is passed to the template
        });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Utility function to validate and convert string to ObjectId

function validateObjectId(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('Invalid ObjectId');
    }
    return new mongoose.Types.ObjectId(id);
}


app.post('/api/EMP/HOD/TRF', async (req, res) => {
    const {
        employeeCode, dateOfRequest, travellerName, mobileNo,
        departmentName, bandDesignation, emailAddress, departureDate,
        departFrom, departureTime, arrivalTo, arrivalTime, hotelName,
        hotelCity, checkInDate, checkOutDate, nights, location, hodId
    } = req.body;


    try {
        // Validate ObjectId
        const assignedHodId = validateObjectId(hodId);

        // Find the HOD
        const hod = await User.findById(assignedHodId);
        if (!hod) {
            console.log('HOD not found:', assignedHodId);
            return res.status(404).json({ message: 'HOD not found' });
        }

        // Convert date strings to Date objects
        const dateOfRequestDate = new Date(dateOfRequest);
        const departureDateDate = departureDate ? new Date(departureDate) : null;
        const checkInDateDate = checkInDate ? new Date(checkInDate) : null;
        const checkOutDateDate = checkOutDate ? new Date(checkOutDate) : null;

        // Validate that the dates are valid if they are provided
        if (isNaN(dateOfRequestDate.getTime())) {
            throw new Error('Invalid Date Format for dateOfRequest');
        }
        if (departureDateDate && isNaN(departureDateDate.getTime())) {
            throw new Error('Invalid Date Format for departureDate');
        }
        if (checkInDateDate && isNaN(checkInDateDate.getTime())) {
            throw new Error('Invalid Date Format for checkInDate');
        }
        if (checkOutDateDate && isNaN(checkOutDateDate.getTime())) {
            throw new Error('Invalid Date Format for checkOutDate');
        }

        // Create a new travel request
        const newEMPTRF = new EMPTRF({
            employeeCode,
            dateOfRequest: dateOfRequestDate,
            travellerName,
            mobileNo,
            departmentName,
            bandDesignation,
            emailAddress,
            departureDate: departureDateDate,
            departFrom,
            departureTime,
            arrivalTo,
            arrivalTime,
            hotelName,
            hotelCity,
            checkInDate: checkInDateDate,
            checkOutDate: checkOutDateDate,
            nights,
            location,
            hodId: assignedHodId  // Use the validated ObjectId
        });

        await newEMPTRF.save();
        res.status(201).json({ message: 'Travel request submitted successfully' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});
app.post('/api/EMP/HOD/STR', async (req, res) => {
    const {
        employeeCode,
        hodId,
        dateOfRequest,
        requisitionerName,
        department,
        itemDescription,
        quantity,
        status,
        decision
    } = req.body;

    try {
        // Validate ObjectId
        if (!mongoose.Types.ObjectId.isValid(hodId)) {
            return res.status(400).json({ message: 'Invalid HOD ID format' });
        }

        // Find the HOD
        const hod = await User.findById(hodId);
        if (!hod) {
            console.log('HOD not found:', hodId);
            return res.status(404).json({ message: 'HOD not found' });
        }

        // Convert date strings to Date objects
        const dateOfRequestDate = new Date(dateOfRequest);

        // Validate that the date is valid if provided
        if (dateOfRequest && isNaN(dateOfRequestDate.getTime())) {
            throw new Error('Invalid Date Format for dateOfRequest');
        }

        // Create a new EMPSTR document
        const newEMPSTR = new EMPSTR({
            employeeCode,
            hodId,
            dateOfRequest: dateOfRequestDate,
            requisitionerName,
            department,
            itemDescription,
            quantity,
            status: status || 'pending', // Default to 'pending' if not provided
            decision: decision || null // Default to null if not provided
        });

        await newEMPSTR.save();
        res.status(201).json({ message: 'Request submitted successfully' });
    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

app.get('/hod/dashboard', async (req, res) => {
    if (req.session.user && req.session.user.role === 'hod') {
        const { startDate, endDate } = req.query;
        let hodId = req.session.user._id;

        try {
            if (!mongoose.Types.ObjectId.isValid(hodId)) {
                return res.status(400).send('Invalid HOD ID');
            }

            hodId = new mongoose.Types.ObjectId(hodId);

            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            const dateFilter = startDate && endDate ? {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            } : {
                $gte: today,
                $lt: tomorrow
            };

            const queryReceived = {
                status: 'pending',
                hodId: hodId,
                dateOfRequest: dateFilter
            };

            const querySent = {
                dateOfRequest: dateFilter
            };

            const receivedFormsFromEMPSTR = await EMPSTR.find(queryReceived);
            const receivedFormsFromEMPTRF = await EMPTRF.find(queryReceived);
            const hodtrf = await HODTRF.find(querySent);

            console.log('Received Forms:', receivedFormsFromEMPTRF);
            console.log('Sent Forms:', hodtrf);
            console.log('HOD ID:', hodId);
            console.log('Date Filter:', dateFilter);


            res.render('hodDashboard', {
                user: req.session.user,
                receivedFormsFromEMPTRF,
                receivedFormsFromEMPSTR,
                hodtrf,
                receivedCount: receivedFormsFromEMPTRF.length,
                sentCount: hodtrf.length,
            });
        } catch (error) {
            console.error('Error:', error.message);
            res.render('hodDashboard', {
                user: req.session.user,
                receivedFormsFromEMPTRF: [],
                receivedFormsFromEMPSTR: [],
                hodtrf: [],
                receivedCount: 0,
                sentCount: 0,
            });
        }
    } else {
        res.redirect('/');
    }
});


app.get('/employee/dashboard', async (req, res) => {
    if (req.session.user && req.session.user.role === 'employee') {
        const { startDate, endDate } = req.query;
        let query = {
            employeeCode: req.session.user.userId,
        };

        if (startDate && endDate) {
            query.dateOfRequest = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        } else {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            query.dateOfRequest = {
                $gte: today,
                $lt: tomorrow
            };
        }

        try {
            const [emtrfs, emstr] = await Promise.all([
                EMPTRF.find(query),
                EMPSTR.find(query)
            ]);

            // Fetch user data
            const user = await User.findById(req.session.user._id).populate('hodId');
            if (!user) {
                console.log('User not found');
                return res.redirect('/');
            }

            res.render('employeeDashboard', {
                user: {
                    ...user.toObject(),
                    hodId: user.hodId ? user.hodId.toString() : ''  // Ensure hodId is a string
                },
                emtrfs,
                emstr,
                debug: {
                    query: JSON.stringify(query),
                    emtrfs: JSON.stringify(emtrfs, null, 2),
                    emstr: JSON.stringify(emstr, null, 2)
                },
                formCount: emtrfs.length + emstr.length
            });
        } catch (error) {
            console.error('Error:', error.message); // Enhanced error logging
            res.render('employeeDashboard', {
                user: req.session.user,
                emtrfs: [],
                emstr: [],
                debug: {
                    query: JSON.stringify(query),
                    emtrfs: '[]',
                    emstr: '[]',
                    error: error.message
                },
                formCount: 0
            });
        }
    } else {
        res.redirect('/');
    }
});

app.get('/driverHOD/dashboard', async (req, res) => {
    if (req.session.user && req.session.user.role === 'Dhod') {
        const { startDate, endDate } = req.query;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        const dateFilter = startDate && endDate ? {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        } : {
            $gte: today,
            $lt: tomorrow
        };

        const querySent = {
            dateOfRequest: dateFilter
        };

        const driverQuery = {
            dateOfRequest: dateFilter
        };

        try {
            const sentForms = await Request.find(querySent);
            const driverBookings = await Request.find(driverQuery);

            // Calculate counts
            const sentCount = sentForms.length;
            const driverCount = driverBookings.length;

            res.render('driverHod', {
                user: req.session.user,
                sentForms,
                driverBookings,
                sentCount,
                driverCount
            });
        } catch (error) {
            res.render('driverHod', {
                user: req.session.user,
                sentForms: [],
                driverBookings: [],
                sentCount: 0,
                driverCount: 0
            });
        }
    } else {
        res.redirect('/');
    }
});

// Driver Dashboard
app.get('/driver/dashboard', async (req, res) => {
    if (req.session.user && req.session.user.role === 'driver') {
        const { startDate, endDate } = req.query;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() - 1);

        let dateFilter = {
            $gte: today,
            $lt: tomorrow
        };

        if (startDate && endDate) {
            dateFilter = {
                $gte: new Date(startDate),
                $lte: new Date(endDate)
            };
        }

        const query = {
            driverId: req.session.user.userId, // Filter by driverId
            date: dateFilter
        };

        try {
            const bookings = await Request.find(query);
            res.render('driverDashboard', {
                user: req.session.user,
                cabCount: bookings.length,
                bookings
            });
        } catch (err) {
            console.error('Error fetching bookings:', err);
            res.render('driverDashboard', {
                user: req.session.user,
                bookings: [],
                cabCount: 0
            });
        }

    } else {
        res.redirect('/');
    }
});