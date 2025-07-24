

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
    describe("Simple variables", function() {
        const query1 = new Query(
            `
            SELECT * FROM table AS t
            WHERE t.id = @id
                OR t.other = @other
                OR t.id = @id
            `
        ).generate({ id: 1, other: "bob" });

        it("Renders keys in correct order", async function() {
            expect(query1.text, "Correct text").to.equal(`
            SELECT * FROM table AS t
            WHERE t.id = $1
                OR t.other = $2
                OR t.id = $1
            `)
            expect(query1.values, "Gets both keys").to.have.length(2);
            expect(query1.values[0], "Key 1 is id").to.equal(1)
            expect(query1.values[1], "Key 2 is other").to.equal("bob");
        });


        const query2 = new Query(
            `SELECT * FROM table AS t`
        ).generate({});
        it("Empty queries can render", async function() {
            expect(query2.text, "Renders text").to.equal(`SELECT * FROM table AS t`);
        });
        it("Empty queries are empty", async function() {
            expect(query2.values, "Identifies query as empty").to.have.length(0);
        });
    });
    describe("Fallbacks", function() {
        const query = new Query(
            `
            UPDATE table SET
                name = @name??name,
                t_type = @type
            WHERE id = @id
            `
        );

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
        it("Can escape '@'", async function() {
            const query = new Query(
                `
                UPDATE table SET
                    email = 'bob@@joe.com'
                WHERE t.id = @id
                `
            ).generate({ id: 1 });
            expect(query.text, "Converts @@ into @").to.equal(`
                UPDATE table SET
                    email = 'bob@joe.com'
                WHERE t.id = $1
                `);
        });
        it("JSON Selectors", async function() {
            const query = new Query(
                `SELECT * FROM table WHERE json_col @@> '{{"key": "value"}}' OR json_col <@@ 'bad' AND id = @id`
            ).generate({ id: 1 });
            expect(query.text, "Converts @@ into @ and {{ into {").to.equal(`SELECT * FROM table WHERE json_col @> '{"key": "value"}' OR json_col <@ 'bad' AND id = $1`)
        });
    });
    describe("Muli-loading", function() {
        it("Can pull multiple queries", async function() {
            const sql = `
            -- @query query1
            SELECT * FROM users;;

            -- @query query2
            SELECT * FROM users
            WHERE id = @id

            `;
            const queries = load(sql);
            expect(queries, "Parsed both querys").to.have.all.keys('query1', 'query2');
            expect(queries.query1.generate({}).text, "Parsed query1").to.equal(`SELECT * FROM users;`);
            expect(queries.query2.generate({ id: 1 }).text, "Parsed query2").to.equal(`SELECT * FROM users
            WHERE id = $1`);
            expect(queries.query2.generate({ id: 1 }).values[0], "Parsed query2 keys value 0").to.equal(1);
        });

    })
})

