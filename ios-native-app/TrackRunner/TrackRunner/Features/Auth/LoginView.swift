//
//  LoginView.swift
//  TrackRunner
//

import SwiftUI

struct LoginView: View {
    @EnvironmentObject private var appState: AppState
    @FocusState private var focusedField: Field?

    @State private var email = ""
    @State private var password = ""
    @State private var isSigningIn = false
    @State private var errorMessage: String?

    private var canSubmit: Bool {
        !email.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty && !isSigningIn
    }

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 28) {
                Spacer(minLength: 24)

                VStack(alignment: .leading, spacing: 8) {
                    Text("TrackRunner")
                        .font(.largeTitle.bold())
                    Text("Courier tracking made simple")
                        .font(.body)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 16) {
                    TextField("Email", text: $email)
                        .textContentType(.username)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                        .textFieldStyle(.roundedBorder)
                        .disabled(isSigningIn)

                    SecureField("Password", text: $password)
                        .textContentType(.password)
                        .focused($focusedField, equals: .password)
                        .submitLabel(.go)
                        .onSubmit { submitIfPossible() }
                        .textFieldStyle(.roundedBorder)
                        .disabled(isSigningIn)
                }

                Button {
                    submitIfPossible()
                } label: {
                    HStack {
                        if isSigningIn {
                            ProgressView()
                                .tint(.white)
                        }
                        Text(isSigningIn ? "Signing In" : "Sign In")
                            .fontWeight(.semibold)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!canSubmit)

                Spacer(minLength: 24)
            }
            .padding(.horizontal, 28)
            .navigationBarTitleDisplayMode(.inline)
            .alert(
                "Login Failed",
                isPresented: Binding(
                    get: { errorMessage != nil },
                    set: { newValue in
                        if !newValue {
                            errorMessage = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Invalid credentials.")
            }
        }
    }

    private func submitIfPossible() {
        guard canSubmit else {
            return
        }

        isSigningIn = true
        Task {
            do {
                try await appState.login(email: email, password: password)
            } catch {
                errorMessage = error.localizedDescription
            }
            isSigningIn = false
        }
    }
}

private enum Field {
    case email
    case password
}

#Preview {
    LoginView()
        .environmentObject(AppState())
}
