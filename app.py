from flask import Flask

app = Flask(__name__)

@app.route('/hello/')
def hello():
    return "Hello, World!"

@app.route('/')
def home():
    return "Hello, World!"

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, ssl_context=('../CuriosityMap/Keys/vrobotator_tau_ac_il_cert.cer',
                                                    '../CuriosityMap/Keys/vrobotator_tau_ac_il_private.key'), debug=True)
