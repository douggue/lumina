# Tools

`risk-analyzer-prototype.py`: first version of the automatic risk analysis described in `docs/PLAN.md` ("Risk labels"). It scores a provider service name/description with keyword rules and suggests Low / Medium / High.

Usage: `python3 risk-analyzer-prototype.py services.txt` where `services.txt` is a provider service list exported as text with `|` between fields.

Prototype only: the real version will live in the app, with rules editable from the admin.
