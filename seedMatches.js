const mongoose = require("mongoose");
if (process.env.NODE_ENV !== "production") {
    require("dotenv").config();
}
const Startup = require("./models/Startup");
const Investor = require("./models/Investor");
const Match = require("./models/Match");
const User = require("./models/User"); // Need User for references

const dbUrl = process.env.DB_URL || "mongodb://127.0.0.1:27017/nexus";

// Connect to MongoDB
mongoose.connect(dbUrl)
    .then(() => console.log("Connected to MongoDB for Seeding"))
    .catch(err => console.error("Could not connect to MongoDB", err));

const seedData = async () => {
    try {
        // Clear existing data (optional, but good for testing)
        await Startup.deleteMany({});
        await Investor.deleteMany({});
        await Match.deleteMany({});
        await User.deleteMany({});

        console.log("Cleared existing data");

        // Create Dummy Users using register for password hashing
        const user1 = new User({ username: "startup1", email: "s1@test.com", role: "startup", hasFilledProfile: true });
        const registeredUser1 = await User.register(user1, "password123");

        const user2 = new User({ username: "investor1", email: "i1@test.com", role: "investor", hasFilledProfile: true });
        const registeredUser2 = await User.register(user2, "password123");

        const user3 = new User({ username: "startup2", email: "s2@test.com", role: "startup", hasFilledProfile: true });
        const registeredUser3 = await User.register(user3, "password123");

        const user4 = new User({ username: "investor2", email: "i2@test.com", role: "investor", hasFilledProfile: true });
        const registeredUser4 = await User.register(user4, "password123");

        // Create Dummy Startups
        const startups = [
            {
                userId: registeredUser1._id,
                startupName: "TechNova",
                industry: "Technology",
                stage: "Seed",
                fundingRequired: 500000,
                equityOffered: 10,
                location: "Bangalore",
                revenueStatus: "Pre-Revenue",
                teamSize: 5,
                pitchDescription: "AI-driven matchmaking for jobs.",
                tags: ["AI", "Recruitment", "SaaS"]
            },
            {
                userId: user3._id,
                startupName: "GreenEarth",
                industry: "CleanTech",
                stage: "Pre-Seed",
                fundingRequired: 100000,
                equityOffered: 15,
                location: "Delhi",
                revenueStatus: "Pre-Revenue",
                teamSize: 2,
                pitchDescription: "Sustainable packaging solutions.",
                tags: ["Environment", "Sustainability", "Plastic-Free"]
            }
        ];

        const createdStartups = await Startup.insertMany(startups);
        console.log(`Created ${createdStartups.length} startups`);

        // Create Dummy Investors
        const investors = [
            {
                userId: user2._id,
                investorName: "VentureCapital One",
                firmName: "VC One",
                email: "contact@vcone.com",
                preferredIndustries: ["Technology", "SaaS"],
                preferredStage: "Seed",
                investmentType: "Equity",
                minInvestment: 200000,
                maxInvestment: 1000000,
                locationPreference: "Bangalore",
                bio: "Looking for high-growth tech startups."
            },
            {
                userId: registeredUser4._id,
                investorName: "Angel Investor Bob",
                firmName: "Bob Angels",
                email: "bob@angels.com",
                preferredIndustries: ["CleanTech", "Healthcare"],
                preferredStage: "Pre-Seed",
                investmentType: "Convertible Note",
                minInvestment: 50000,
                maxInvestment: 200000,
                locationPreference: "Any",
                bio: "Investing in sustainable future."
            }
        ];

        const createdInvestors = await Investor.insertMany(investors);
        console.log(`Created ${createdInvestors.length} investors`);

        console.log("Seeding Completed!");
        mongoose.connection.close();

    } catch (error) {
        console.error("Error seeding data:", error);
        mongoose.connection.close();
    }
};

seedData();
