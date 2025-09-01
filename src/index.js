const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config");

const app = express();
// convert data into json format
app.use(express.json());

app.use(express.urlencoded({extended: false}));

// use EJS as view engine
app.set('view engine', 'ejs');
// link css
app.use(express.static("public"));


app.get("/", (req, res) => {
    res.render("login");
});

// Add GET /login route
app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

// Register User 
app.post("/signup", async (req, res) => {
    try {
        const data = {
            name: req.body.username,
            email: req.body.email,
            password: req.body.password
        };
        await collection.create(data);
        res.redirect("/login");
    } catch (err) {
        res.status(400).send("Signup failed: " + err.message);
    }
});

// Login User
app.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await collection.findOne({ name: username });
        if (!user) {
            return res.status(400).send("User not found");
        }
        // If you use bcrypt for password hashing, compare here
        // const valid = await bcrypt.compare(password, user.password);
        // For now, plain text check:
        if (user.password !== password) {
            return res.status(400).send("Invalid password");
        }
        // Render home page with username
        res.render("home", { username: user.name });
    } catch (err) {
        res.status(400).send("Login failed: " + err.message);
    }
});

// Logout route (dummy, just redirect to login)
app.post("/logout", (req, res) => {
    res.redirect("/login");
});

const port = 5000;
app.listen(port, () => {
    console.log(`Server running on Port: ${port}`)
})
