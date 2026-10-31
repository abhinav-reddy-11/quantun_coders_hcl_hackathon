"""
Generates the demo seed data for WorkforceIQ (deterministic, seed=42).

Outputs:
  database/seed.sql                                     - skills, employees, employee_skills, related_skills, demand_history
  python-services/ml/dataset/skill_demand_history.csv   - same historical dataset as CSV (Quarter, Skill, Number_of_People_Required)

Usage: python database/generate_seed.py
"""
import csv
import random
from pathlib import Path

random.seed(42)
ROOT = Path(__file__).resolve().parent.parent

SKILLS = [  # (id, name, category, base_demand_Q1_2023, quarterly_slope)
    (1, "Python", "Programming", 18, 1.6),
    (2, "SQL", "Data", 15, 0.5),
    (3, "Machine Learning", "AI / ML", 6, 1.2),
    (4, "Deep Learning", "AI / ML", 2, 0.8),
    (5, "Generative AI", "AI / ML", 0, 1.6),
    (6, "Statistics", "Data", 6, 0.3),
    (7, "Data Engineering", "Data", 6, 0.8),
    (8, "Data Visualization", "Data", 6, 0.3),
    (9, "Cloud Computing", "Infrastructure", 8, 1.0),
    (10, "Docker", "Infrastructure", 6, 0.5),
    (11, "Kubernetes", "Infrastructure", 2, 0.7),
    (12, "DevOps", "Infrastructure", 6, 0.6),
    (13, "React", "Web", 12, 0.5),
    (14, "Node.js", "Web", 11, 0.4),
    (15, "Java", "Programming", 18, -0.6),
    (16, "Cybersecurity", "Security", 3, 0.6),
]
SID = {name: sid for sid, name, *_ in SKILLS}

# skill -> [(related skill, strength)] : "knowing the related skill helps you learn this skill"
RELATED = {
    "Python": [("Java", .5), ("SQL", .4), ("Node.js", .3)],
    "SQL": [("Python", .4), ("Data Visualization", .4), ("Java", .3)],
    "Machine Learning": [("Python", .9), ("Statistics", .9), ("SQL", .5), ("Data Visualization", .4)],
    "Deep Learning": [("Machine Learning", .95), ("Python", .85), ("Statistics", .6)],
    "Generative AI": [("Deep Learning", .85), ("Machine Learning", .8), ("Python", .8), ("Cloud Computing", .35), ("Node.js", .3)],
    "Statistics": [("Python", .5), ("Data Visualization", .5), ("SQL", .4)],
    "Data Engineering": [("SQL", .9), ("Python", .8), ("Cloud Computing", .6), ("Docker", .4)],
    "Data Visualization": [("SQL", .6), ("Statistics", .6), ("Python", .5), ("React", .3)],
    "Cloud Computing": [("Docker", .7), ("DevOps", .7), ("Kubernetes", .6), ("Python", .3)],
    "Docker": [("DevOps", .7), ("Cloud Computing", .5), ("Node.js", .3)],
    "Kubernetes": [("Docker", .95), ("Cloud Computing", .8), ("DevOps", .8)],
    "DevOps": [("Docker", .8), ("Cloud Computing", .7), ("Python", .4), ("Java", .3)],
    "React": [("Node.js", .7), ("Data Visualization", .3)],
    "Node.js": [("React", .7), ("SQL", .4), ("Java", .4), ("Python", .3)],
    "Java": [("Python", .4), ("SQL", .4), ("Node.js", .3)],
    "Cybersecurity": [("Cloud Computing", .6), ("DevOps", .6), ("Python", .4), ("Kubernetes", .4)],
}

# archetype -> (department, core skills, optional skills with probability)
ARCHETYPES = {
    "ds": ("Data & AI", ["Python", "SQL", "Statistics", "Machine Learning"], [("Data Visualization", .7), ("Deep Learning", .3)]),
    "mle": ("Data & AI", ["Python", "Machine Learning", "Deep Learning"], [("Docker", .6), ("Generative AI", .5), ("Cloud Computing", .4)]),
    "de": ("Data Platform", ["Python", "SQL", "Data Engineering"], [("Cloud Computing", .6), ("Docker", .4)]),
    "da": ("Analytics", ["SQL", "Data Visualization"], [("Statistics", .7), ("Python", .5)]),
    "fe": ("Product Engineering", ["React"], [("Node.js", .6), ("Data Visualization", .2)]),
    "java": ("Product Engineering", ["Java", "SQL"], [("Docker", .3), ("Python", .2)]),
    "node": ("Product Engineering", ["Node.js", "SQL"], [("React", .6), ("Docker", .4)]),
    "ops": ("Platform & Cloud", ["DevOps", "Docker", "Cloud Computing"], [("Kubernetes", .6), ("Python", .6)]),
    "sec": ("Security", ["Cybersecurity"], [("Python", .6), ("Cloud Computing", .5)]),
}

EMPLOYEES = [
    ("Aarav Sharma", "ds"), ("Ananya Reddy", "ds"), ("Rohan Mehta", "ds"), ("Ishita Verma", "ds"),
    ("Kabir Nair", "ds"), ("Meera Iyer", "ds"),
    ("Vikram Rao", "mle"), ("Sneha Kulkarni", "mle"), ("Arjun Pillai", "mle"),
    ("Priya Menon", "de"), ("Siddharth Joshi", "de"), ("Divya Krishnan", "de"), ("Nikhil Gupta", "de"),
    ("Tanvi Desai", "de"),
    ("Aditi Banerjee", "da"), ("Rahul Bhatt", "da"), ("Kavya Shetty", "da"), ("Manish Agarwal", "da"),
    ("Pooja Chawla", "da"), ("Harsh Vardhan", "da"),
    ("Neha Saxena", "fe"), ("Aditya Kapoor", "fe"), ("Riya Malhotra", "fe"), ("Karthik Subramanian", "fe"),
    ("Simran Kaur", "fe"),
    ("Suresh Babu", "java"), ("Lakshmi Narayanan", "java"), ("Deepak Yadav", "java"), ("Anjali Mishra", "java"),
    ("Varun Tiwari", "java"), ("Shreya Ghosh", "java"), ("Mohit Chauhan", "java"),
    ("Abhishek Patil", "node"), ("Nandini Rao", "node"), ("Gaurav Sinha", "node"), ("Swati Jain", "node"),
    ("Ravi Teja", "ops"), ("Farhan Qureshi", "ops"), ("Sanjana Hegde", "ops"),
    ("Imran Sheikh", "sec"),
]


def build_employees():
    rows, links = [], []
    for eid, (name, arch) in enumerate(EMPLOYEES, start=1):
        dept, core, optional = ARCHETYPES[arch]
        skills = {s: random.randint(3, 5) for s in core}
        for s, p in optional:
            if random.random() < p:
                skills[s] = random.randint(2, 4)
        rows.append((eid, name, dept))
        links += [(eid, SID[s], lvl) for s, lvl in skills.items()]
    return rows, links


def build_history():
    hist = []
    quarters = [(y, q) for y in (2023, 2024, 2025, 2026) for q in (1, 2, 3, 4)][:15]  # Q1 2023 .. Q3 2026
    for sid, name, _, base, slope in SKILLS:
        for t, (y, q) in enumerate(quarters):
            value = base + slope * t + random.gauss(0, 1.1)
            hist.append((sid, name, y, q, max(0, round(value))))
    return hist


def q(s):
    return "'" + s.replace("'", "''") + "'"


def main():
    emps, links = build_employees()
    hist = build_history()
    out = ["-- Generated by database/generate_seed.py. Do not edit by hand.", "BEGIN;"]
    out.append("INSERT INTO skills (id, skill_name, category) VALUES")
    out.append(",\n".join(f"({sid}, {q(n)}, {q(c)})" for sid, n, c, *_ in SKILLS) + ";")
    out.append("INSERT INTO employees (id, name, department) VALUES")
    out.append(",\n".join(f"({i}, {q(n)}, {q(d)})" for i, n, d in emps) + ";")
    out.append("INSERT INTO employee_skills (employee_id, skill_id, proficiency_level) VALUES")
    out.append(",\n".join(f"({e}, {s}, {l})" for e, s, l in links) + ";")
    out.append("INSERT INTO related_skills (skill_id, related_skill_id, strength) VALUES")
    out.append(",\n".join(f"({SID[s]}, {SID[r]}, {st:.2f})" for s, rel in RELATED.items() for r, st in rel) + ";")
    out.append("INSERT INTO demand_history (skill_id, year, q, required_people) VALUES")
    out.append(",\n".join(f"({sid}, {y}, {qq}, {v})" for sid, _, y, qq, v in hist) + ";")
    for t in ("skills", "employees"):
        out.append(f"SELECT setval(pg_get_serial_sequence('{t}', 'id'), (SELECT MAX(id) FROM {t}));")
    out.append("COMMIT;")
    (ROOT / "database" / "seed.sql").write_text("\n".join(out) + "\n")

    ds = ROOT / "python-services" / "ml" / "dataset"
    ds.mkdir(parents=True, exist_ok=True)
    with open(ds / "skill_demand_history.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Quarter", "Skill", "Number_of_People_Required"])
        for _, name, y, qq, v in hist:
            w.writerow([f"Q{qq} {y}", name, v])

    counts = {}
    for _, s, _ in links:
        counts[s] = counts.get(s, 0) + 1
    for sid, name, *_ in SKILLS:
        print(f"{name:20s} existing={counts.get(sid, 0)}")
    print(f"{len(emps)} employees, {len(links)} employee_skills, {len(hist)} history rows")


if __name__ == "__main__":
    main()
