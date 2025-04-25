

`
-- @query get_your_mom
SELECT * FROM your_mom
WHERE id = @id??t.id
    OR t.test = @test
    OR id = @id
    OR id = @> cons.com


-- @query get_your_other_mom
SELECT * FROM your_mom
WHERE id = @id
`



const { expect } = require('chai');
const { Query, load } = require("../index.js");

describe("Query", function() {
    describe("Static", function() {
        const query1 = new Query(
            "test",
            `
            SELECT * FROM table AS t
            WHERE t.id = @id
                OR t.other = @other
                OR t.id = @id
            `
        );

        it("Identifies as static", async function() {
            expect(query1.static, "Identifies query as static").to.be.true;
        });
        it("Renders keys in correct order", async function() {
            expect(query1.text, "Identifies query as static").to.equal(`
            SELECT * FROM table AS t
            WHERE t.id = $1
                OR t.other = $2
                OR t.id = $1
            `)
            expect(query1.keys, "Gets both keys").to.have.length(2);
            expect(query1.keys[0], "Key 1 is id").to.equal("id")
            expect(query1.keys[1], "Key 2 is other").to.equal("other");
        });


        const query2 = new Query(
            "test",
            `SELECT * FROM table AS t`
        );
        it("Empty queries are static", async function() {
            expect(query2.static, "Identifies query as static").to.be.true;
        });
        it("Empty queries are also empty", async function() {
            expect(query2.keys, "Identifies query as empty").to.have.length(0);
        });
        it("Empty queries can render", async function() {
            const { text, values } = query2.generate();
            expect(text, "Renders text").to.equal(query2.text);
            expect(values, "Renders values").to.have.length(0);
        });
    });
    describe("Non-static", function() {
        const query = new Query(
            "test",
            `
            UPDATE table SET
                name = @name??name,
                t_type = @type
            WHERE id = @id
            `
        );

        it("Identifies as non-static", async function() {
            expect(query.static, "Identifies query as non-static").to.be.false;
        });
        it("Gets keys", async function() {
            const keys = query.parts.filter((p) => p.type=="key");
            expect(keys, "Gets all three keys").to.have.length(3);
            expect(keys[0].key, "First key is name").to.equal("name");
            expect(keys[0].fallback, "Name fallsback to `name`").to.equal("name");
            expect(keys[1].key, "Second key is type").to.equal("type");
            expect(keys[1].fallback, "Type doesn't fall back to anything").to.equal(undefined);
            expect(keys[2].key, "Third key is id").to.equal("id");
            expect(keys[2].fallback, "Id doesn't fall back to anything").to.equal(undefined);
        });
        it("Renders values", async function() {
            const { text, values } = query.generate({ id: 1, name: "bob", type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = $1,
                t_type = $2
            WHERE id = $3
            `);
            expect(values, "Gets all three values").to.have.length(3);
            expect(values[0], "First key is from name").to.equal("bob");
            expect(values[1], "Second key is from type").to.equal("green");
            expect(values[2], "Third key is from id").to.equal(1);
        });
        it("Renders undefined (with no fallback)", async function() {
            const { text, values } = query.generate({ id: undefined, name: "bob", type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = $1,
                t_type = $2
            WHERE id = $3
            `);
            expect(values, "Gets all three values").to.have.length(3);
            expect(values[0], "First key is from name").to.equal("bob");
            expect(values[1], "Second key is from type").to.equal("green");
            expect(values[2], "Third key is from id").to.equal(undefined);
        });
        it("Renders undefined as fallback", async function() {
            const { text, values } = query.generate({ id: 1, name: undefined, type: "green" });
            expect(text, "Renders text").to.equal(`
            UPDATE table SET
                name = name,
                t_type = $1
            WHERE id = $2
            `);
            expect(values, "Gets all only two values").to.have.length(2);
            expect(values[0], "First key is from type").to.equal("green");
            expect(values[1], "Second key is from id").to.equal(1);
        });
        it("Renders undefined as fallback but only if requested", async function() {
            const query = new Query(
                "test",
                `UPDATE table SET
                    name = @name??name,
                    t_type = @type
                WHERE name is not @name`
            );
            const { text, values } = query.generate({ name: undefined, type: "green" });
            expect(text, "Renders text").to.equal(
                `UPDATE table SET
                    name = name,
                    t_type = $1
                WHERE name is not $2`);
            expect(values, "Gets all two values").to.have.length(2);
            expect(values[0], "First key is from type").to.equal("green");
            expect(values[1], "Second key is from name").to.equal(undefined);
        });
    });
    describe("Special characters", function() {
        it("Email address", async function() {
            const query = new Query(
                "test",
                `
                UPDATE table SET
                    email = bob@joe.com
                WHERE t.id = @id
                `
            );
            expect(query.keys, "Doesn't capture the email address").to.be.length(1);
            expect(query.keys[0], "Does capture the id").to.equal("id");
        });
        it("JSON Selectors", async function() {
            const query = new Query(
                "test",
                `SELECT * FROM table WHERE json_col @> '{"key": "value"}' OR json_col <@ 'bad' AND id = @id`
            );
            expect(query.keys, "Doesn't capture the selector").to.be.length(1);
            expect(query.keys[0], "Does capture the id").to.equal("id");
        });
    });
    describe("Muli-loading", function() {
        it("Can pull multiple queries", async function() {
            const sql = `
            -- @query query1
            SELECT * FROM users;

            -- @query query2
            SELECT * FROM users
            WHERE id = @id;

            `;
            const queries = load(sql);
            expect(queries, "Parsed both querys").to.have.all.keys('query1', 'query2');
            expect(queries.query1.text, "Parsed query1").to.equal(`SELECT * FROM users;`);
            expect(queries.query1.keys, "Parsed query1 keys").to.have.length(0);
            expect(queries.query2.text, "Parsed query2").to.equal(`SELECT * FROM users
            WHERE id = $1;`);
            expect(queries.query2.keys, "Parsed query2 keys").to.have.length(1);
            expect(queries.query2.keys[0], "Parsed query2 keys value 0").to.equal("id");
        });

    })
})

