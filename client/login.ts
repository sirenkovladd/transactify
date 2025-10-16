import van, { type State } from "vanjs-core";
import { token } from "./common";

const { div, form, h2, input, button, p } = van.tags;

async function login(username: string, password: string, error: State<string>) {
  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText);
    }
    const data = await response.json();
    token.val = data.token;
    error.val = '';
  } catch (error: any) {
    error.val = error.message;
  }
}

export function Login() {
  const username = van.state('');
  const password = van.state('');
  const error = van.state('');

  return div({ id: 'login-container' },
    form({
      id: 'login-form', onsubmit: (e) => {
        e.preventDefault();
        login(username.val, password.val, error);
      }
    },
      h2('Login'),
      input({ type: 'text', id: 'username', placeholder: 'Username', val: username, oninput: (e) => username.val = e.target.value, required: true }),
      input({ type: 'password', id: 'password', placeholder: 'Password', val: password, oninput: (e) => password.val = e.target.value, required: true }),
      button({ type: 'submit' }, 'Login'),
      () => error.val ? p({ id: 'login-error' }, error.val) : ''
    )
  )
}