const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const collection = require("./config");
const mediaRouter = require("./routes/media");


const session = require('express-session');
const app = express();

app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.set('view engine', 'ejs');

app.use(express.static("public"));

app.use(session({
    secret: 'your_secret_key',
    resave: false,
    saveUninitialized: true
}));


app.get("/upload", (req, res) => {
    res.render("upload");
});

app.use("/media", mediaRouter);


app.get("/", (req, res) => {
    res.render("login");
});


app.get("/login", (req, res) => {
    res.render("login");
});

app.get("/signup", (req, res) => {
    res.render("signup");
});

    
    app.get("/home", (req, res) => {
        res.render("home", { username: "" });
    });

app.post("/signup", async (req, res) => {
    try {
    
        const existingUser = await collection.findOne({ email: req.body.email });
        if (existingUser) {
            return res.status(400).send("Signup failed: Email already registered");
        }
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

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await collection.findOne({ email });
        if (!user) {
            return res.status(400).send("User not found");
        }

        if (user.password !== password) {
            return res.status(400).send("Invalid password");
        }

    req.session.username = user.name;
    req.session.userEmail = user.email;
    res.redirect("/home");
    } catch (err) {
        res.status(400).send("Login failed: " + err.message);
    }
});

app.post("/logout", (req, res) => {
    res.redirect("/login");
});

const port = 5000;
app.listen(port, () => {
    console.log(`Server running on Port: ${port}`)
})
