(() => {
  const client = window.aikivoSupabase;
  if (!client) return;
  const screen = document.getElementById("authScreen");
  const card = screen.querySelector(".auth-card");
  const form = document.getElementById("authForm");
  const heading = document.getElementById("authHeading");
  const sub = document.getElementById("authSub");
  const businessWrap = document.getElementById("businessNameWrap");
  const businessInput = document.getElementById("authBusiness");
  const email = document.getElementById("authEmail");
  const password = document.getElementById("authPassword");
  const submit = document.getElementById("authSubmit");
  const message = document.getElementById("authMessage");
  const switchButton = document.getElementById("authSwitch");
  const switchText = document.getElementById("authSwitchText");
  const signOut = document.getElementById("signOut");
  let mode = "signin";
  let busy = false;

  const forgot = document.createElement("button");
  forgot.type = "button";
  forgot.textContent = "Forgot password?";
  forgot.style.cssText = "display:block;margin:12px auto 0;background:none;border:0;color:#6476c8;font:inherit;cursor:pointer";
  form.insertAdjacentElement("afterend", forgot);

  const recovery = document.createElement("form");
  recovery.hidden = true;
  recovery.style.cssText = "margin-top:18px;display:grid;gap:12px";
  recovery.innerHTML = '<label>New password<input id="aikivoNewPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="At least 8 characters"></label><label>Confirm new password<input id="aikivoConfirmPassword" type="password" minlength="8" autocomplete="new-password" required placeholder="Enter it again"></label><button class="primary" type="submit">Update password</button>';
  card.appendChild(recovery);

  function say(text, error) {
    message.textContent = text || "";
    message.style.color = error ? "#b42318" : "#287a4b";
  }
  function setMode(next) {
    mode = next;
    const creating = mode === "signup";
    heading.textContent = creating ? "Create your workspace" : "Sign in to AIKIVO";
    sub.textContent = creating ? "Start with a secure business account." : "Manage your business AI from one secure workspace.";
    businessWrap.hidden = !creating;
    businessInput.required = creating;
    submit.textContent = creating ? "Create account" : "Sign in";
    switchText.textContent = creating ? "Already have an account?" : "New to AIKIVO?";
    switchButton.textContent = creating ? "Sign in" : "Create account";
    password.autocomplete = creating ? "new-password" : "current-password";
    forgot.hidden = creating;
    say("");
  }
  async function enter(session) {
    if (!session) return;
    screen.classList.add("hidden");
    document.getElementById("accountState").textContent = "SIGNED IN · CLOUD WORKSPACE";
    signOut.hidden = false;
    try {
      const { data, error } = await client.from("business_members")
        .select("business_id, businesses(name)")
        .eq("user_id", session.user.id).limit(1).maybeSingle();
      if (error) throw error;
      if (data && data.businesses && data.businesses.name) {
        const raw = localStorage.getItem("aikivo_demo_data");
        const saved = raw ? JSON.parse(raw) : {};
        saved.business = Object.assign({}, saved.business || {}, {name:data.businesses.name});
        localStorage.setItem("aikivo_demo_data", JSON.stringify(saved));
        const side = document.getElementById("sideBusiness");
        if (side) side.textContent = data.businesses.name;
        const field = document.getElementById("businessName");
        if (field) field.value = data.businesses.name;
      }
    } catch (e) {
      document.getElementById("accountState").textContent = "SIGNED IN";
      console.warn("Workspace lookup:", e.message);
    }
  }

  forgot.addEventListener("click", async () => {
    const address = email.value.trim();
    if (!address) {
      say("Enter your account email first.", true);
      email.focus();
      return;
    }
    forgot.disabled = true;
    say("Sending password reset email…");
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      const { error } = await client.auth.resetPasswordForEmail(address, { redirectTo });
      if (error) throw error;
      say("If an account exists for that email, a password reset link has been sent. Check your inbox and spam folder.");
    } catch (e) {
      say(e.message || "Could not send the reset email. Please try again.", true);
    } finally {
      forgot.disabled = false;
    }
  });

  recovery.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    const next = document.getElementById("aikivoNewPassword").value;
    const confirm = document.getElementById("aikivoConfirmPassword").value;
    if (next.length < 8) { say("Use at least 8 characters.", true); return; }
    if (next !== confirm) { say("The passwords do not match.", true); return; }
    busy = true;
    const button = recovery.querySelector("button");
    button.disabled = true;
    say("Updating password…");
    try {
      const { data, error } = await client.auth.updateUser({ password: next });
      if (error) throw error;
      recovery.hidden = true;
      form.hidden = false;
      forgot.hidden = false;
      say("Password updated. Opening your workspace…");
      await enter(data.user ? (await client.auth.getSession()).data.session : null);
    } catch (e) {
      say(e.message || "Could not update password. Request a new reset link.", true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    busy = true; submit.disabled = true; say(mode === "signup" ? "Creating your account…" : "Signing in…");
    try {
      const credentials = {email:email.value.trim(), password:password.value};
      if (mode === "signup") {
        const business_name = businessInput.value.trim();
        if (!business_name) throw new Error("Enter your business name.");
        const {data,error} = await client.auth.signUp({ ...credentials, options:{data:{business_name}} });
        if (error) throw error;
        if (data.session) await enter(data.session);
        else say("Account created. Check your email to confirm it, then sign in.");
      } else {
        const {data,error} = await client.auth.signInWithPassword(credentials);
        if (error) throw error;
        await enter(data.session);
      }
    } catch (e) { say(e.message || "Authentication failed. Please try again.", true); }
    finally { busy = false; submit.disabled = false; }
  });
  switchButton.addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));
  signOut.addEventListener("click", async () => {
    signOut.disabled = true;
    const {error} = await client.auth.signOut();
    signOut.disabled = false;
    if (error) { document.getElementById("accountState").textContent = "SIGN-OUT ERROR"; return; }
    screen.classList.remove("hidden");
    setMode("signin");
    password.value = "";
  });
  client.auth.getSession().then(({data}) => {
    if (data.session) enter(data.session);
    else { screen.classList.remove("hidden"); signOut.hidden = true; }
  });
  client.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) enter(session);
    if (event === "PASSWORD_RECOVERY" && session) {
      screen.classList.remove("hidden");
      form.hidden = true;
      forgot.hidden = true;
      heading.textContent = "Set a new password";
      sub.textContent = "Choose a new password for your AIKIVO account.";
      recovery.hidden = false;
      say("Reset link verified. Choose your new password.");
    }
    if (event === "SIGNED_OUT") { screen.classList.remove("hidden"); signOut.hidden = true; }
  });
  setMode("signin");
})();